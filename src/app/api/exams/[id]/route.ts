import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/exams/[id] — start an exam attempt
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // MEDIUM-2 RBAC fix: only CANDIDATE role may start an exam attempt;
  // staff roles (TRAINER, EXAMINER, PROCTOR, etc.) must not sit exams under their own account
  if (session.user.role !== USER_ROLES.CANDIDATE) {
    return NextResponse.json({ error: "Forbidden — only candidates may start exam attempts" }, { status: 403 });
  }

  // 5 exam starts per hour per user — generous enough for legitimate connection
  // drops/browser refreshes, but well below what a DoS script would need.
  // (maxAttempts per paper is typically 3; 5/hour covers retries across papers.)
  const rl = await rateLimit(session.user.id, "exam-start", { limit: 5, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const { id: examPaperId } = await params;

  // Cl.7.6 ISO 17024 — suspension must immediately block new exam attempts.
  // The JWT session carries status at login time but may be stale if the user
  // was suspended mid-session. Re-fetch the live status from the DB here so a
  // suspended candidate cannot start a new attempt using an existing JWT.
  const liveUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { status: true },
  });
  if (!liveUser || liveUser.status === "SUSPENDED" || liveUser.status === "INACTIVE") {
    return NextResponse.json(
      { error: "Your account has been suspended. You may not start new exam attempts." },
      { status: 403 },
    );
  }

  const examPaper = await db.examPaper.findUnique({
    where: { id: examPaperId, isActive: true },
    include: {
      sections: { include: { questions: { where: { isArchived: false } } } },
      scheme: true,
    },
  });
  if (!examPaper) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

  // C6: Enrolment gate — a candidate must be enrolled in the scheme linked to
  // this exam paper before they can start an attempt. Prevents unenrolled
  // users from sitting exams by calling this endpoint directly.
  if (examPaper.scheme) {
    const enrolment = await db.enrolment.findFirst({
      where: {
        userId: session.user.id,
        course: { schemeId: examPaper.scheme.id },
        status: { in: ["ACTIVE", "COMPLETED"] },
      },
    });
    if (!enrolment) {
      return NextResponse.json(
        { error: "You must be enrolled in the scheme associated with this exam before you can start." },
        { status: 403 },
      );
    }
  }

  // M (multi-paper attempt count): count attempts at the scheme level, not just
  // the specific exam paper. A scheme may have multiple active papers; the
  // maxAttempts limit applies across all of them, not per-paper.
  const attemptCount = examPaper.scheme
    ? await db.examAttempt.count({
        where: {
          userId: session.user.id,
          examPaper: { schemeId: examPaper.scheme.id },
          status: { in: ["COMPLETED", "VOIDED"] },
        },
      })
    : await db.examAttempt.count({
        where: { userId: session.user.id, examPaperId, status: { in: ["COMPLETED", "VOIDED"] } },
      });
  const maxAttempts = examPaper.scheme?.maxAttempts ?? 3;
  if (attemptCount >= maxAttempts) {
    return NextResponse.json({ error: "Maximum attempts reached" }, { status: 400 });
  }

  // Prevent duplicate IN_PROGRESS attempts. Array form is PgBouncer compatible
  // (Supabase). The activeCount guard moves outside the transaction as a
  // read-only pre-check; the small TOCTOU window is bounded by the per-user
  // rate limit (5 exam starts/hr) applied above.
  const activeCount = await db.examAttempt.count({
    where: { userId: session.user.id, examPaperId, status: "IN_PROGRESS" },
  });
  if (activeCount > 0) {
    return NextResponse.json({ error: "An attempt is already in progress for this exam" }, { status: 409 });
  }

  const [, attempt] = await db.$transaction([
    db.examAttempt.updateMany({
      where: { userId: session.user.id, examPaperId, status: "IN_PROGRESS" },
      data: { status: "CANCELLED" },
    }),
    db.examAttempt.create({
      data: {
        userId: session.user.id,
        examPaperId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        attemptNumber: attemptCount + 1,
        durationMins: examPaper.durationMins,
      },
    }),
  ]);

  if (!attempt) {
    return NextResponse.json({ error: "An attempt is already in progress for this exam" }, { status: 409 });
  }

  // Build question list (randomise if configured)
  // CRITICAL fix: strip isCorrect and correctAnswer from every option/question
  // before sending to the client. The stored JSON includes isCorrect: true/false
  // on each option; sending that lets a candidate read answers from DevTools.
  let questions = examPaper.sections.flatMap((s) =>
    s.questions.map((q) => ({
      id: q.id,
      sectionId: q.sectionId,
      sectionTitle: s.title,
      type: q.type,
      text: q.text,
      imageUrl: q.imageUrl,
      marks: q.marks,
      options: q.options
        ? (JSON.parse(q.options) as Array<{ id: string; text: string; isCorrect: boolean }>)
            .map(({ id, text }) => ({ id, text })) // ← strip isCorrect
        : [],
      // correctAnswer is intentionally omitted — never sent to client
    }))
  );

  // Fisher-Yates shuffle using crypto random — uniform and unbiased
  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(
        (crypto.getRandomValues(new Uint32Array(1))[0] / (0xffffffff + 1)) * (i + 1)
      );
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  if (examPaper.randomiseQuestions) {
    questions = shuffle(questions);
  }

  if (examPaper.randomiseOptions) {
    questions = questions.map((q) => ({
      ...q,
      options: shuffle(q.options),
    }));
  }

  // Only create a proctoring session when the paper requires it.
  if (examPaper.requiresProctoring) {
    await db.proctoringSession.create({
      data: { attemptId: attempt.id, status: "active" },
    });
  }

  await auditLog({
    userId: session.user.id,
    action: "EXAM_STARTED",
    entityType: "ExamAttempt",
    entityId: attempt.id,
    metadata: { examPaperId, attemptNumber: attempt.attemptNumber },
  });

  return NextResponse.json({
    attempt,
    questions,
    durationMins: examPaper.durationMins,
    totalMarks: examPaper.totalMarks,
    passMark: examPaper.passMark,
    allowReview: examPaper.allowReview,
  });
}
