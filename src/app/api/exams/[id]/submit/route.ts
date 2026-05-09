import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

const schema = z.object({
  attemptId: z.string(),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

// POST /api/exams/[id]/submit — submit exam answers
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: examPaperId } = await params;

  // 3 submits per 10 minutes per user — absorbs the legitimate double-submit
  // (slow network causing the user to click twice) without opening a replay
  // window. The DB-level status=IN_PROGRESS check is the true idempotency
  // guard; this rate limit reduces unnecessary DB load from scripted replays.
  const submitRl = await rateLimit(session.user.id, "exam-submit", { limit: 3, windowMs: 10 * 60_000 });
  if (!submitRl.success) {
    return NextResponse.json(
      { error: "Too many submission attempts. Please wait before retrying." },
      { status: 429, headers: { "Retry-After": String(submitRl.retryAfterSecs) } },
    );
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const { attemptId, answers } = body.data;

  const attempt = await db.examAttempt.findFirst({
    where: { id: attemptId, userId: session.user.id, status: "IN_PROGRESS" },
  });
  if (!attempt) return NextResponse.json({ error: "Attempt not found or already submitted" }, { status: 404 });

  const examPaper = await db.examPaper.findUnique({
    where: { id: examPaperId },
    select: {
      id: true,
      title: true,
      durationMins: true,
      totalMarks: true,
      passMark: true,
      requiresProctoring: true,
      sections: { include: { questions: true } },
    },
  });
  if (!examPaper) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

  // CRITICAL fix: enforce the exam deadline server-side.
  // startedAt is written at attempt creation — it cannot be manipulated by the client.
  // A 60-second grace window absorbs network latency and the client-side auto-submit
  // delay; anything beyond that is a deliberate timing attack.
  if (attempt.startedAt) {
    const GRACE_MS = 60 * 1000; // 60 seconds for network round-trip
    const deadlineMs = attempt.startedAt.getTime() + examPaper.durationMins * 60 * 1000 + GRACE_MS;
    if (Date.now() > deadlineMs) {
      // Mark as COMPLETED but flag it — the auto-grader will still run so the
      // candidate doesn't get a free pass, but the overage is audit-logged.
      await db.examAttempt.update({
        where: { id: attemptId },
        data: { status: "COMPLETED", submittedAt: new Date(), durationMins: examPaper.durationMins },
      });
      await auditLog({
        userId: session.user.id,
        action: "EXAM_LATE_SUBMISSION",
        entityType: "ExamAttempt",
        entityId: attemptId,
        metadata: {
          examPaperId,
          startedAt: attempt.startedAt,
          allowedMins: examPaper.durationMins,
          actualMins: Math.round((Date.now() - attempt.startedAt.getTime()) / 60000),
        },
      });
      return NextResponse.json(
        { error: "Submission rejected — exam time has expired" },
        { status: 422 }
      );
    }
  }

  const allQuestions = examPaper.sections.flatMap((s) => s.questions);

  // Grading iterates allQuestions (DB-sourced), not Object.keys(answers) (client-sourced).
  // Extra answer keys for question IDs that don't exist in the paper are silently ignored —
  // no orphaned response records are created and no marks are awarded for fake IDs.

  // Auto-grade objective questions
  let rawScore = 0;
  let totalObjectiveMarks = 0;
  let hasManualQuestions = false;

  const responseRecords = [];

  for (const question of allQuestions) {
    const answer = answers[question.id];
    let isCorrect: boolean | null = null;
    let marksAwarded = 0;

    if (["mcq_single", "mcq_multi", "true_false"].includes(question.type)) {
      totalObjectiveMarks += question.marks;
      if (question.options) {
        const opts: { id: string; text: string; isCorrect: boolean }[] = JSON.parse(question.options);
        const correctIds = opts.filter((o) => o.isCorrect).map((o) => o.id);

        if (question.type === "mcq_single" || question.type === "true_false") {
          isCorrect = answer === correctIds[0];
        } else {
          // mcq_multi — all correct options must be selected, no extras
          const selectedArr = Array.isArray(answer) ? answer : answer ? [answer] : [];
          isCorrect =
            selectedArr.length === correctIds.length &&
            selectedArr.every((id) => correctIds.includes(id));
        }
        marksAwarded = isCorrect ? question.marks : 0;
        rawScore += marksAwarded;
      }
    } else if (["fill_blank"].includes(question.type)) {
      totalObjectiveMarks += question.marks;
      const correct = question.correctAnswer?.toLowerCase().trim();
      const given = String(answer ?? "").toLowerCase().trim();
      isCorrect = given === correct;
      marksAwarded = isCorrect ? question.marks : 0;
      rawScore += marksAwarded;
    } else {
      // essay, drag_drop — manual grading required
      hasManualQuestions = true;
      isCorrect = null;
      marksAwarded = 0;
    }

    // Cl.6.1 ISO 17024 — capture question snapshot at submission time.
    // If the question is later edited or archived the appeals panel can still
    // reconstruct the exact wording and mark allocation the candidate faced.
    // Options are stored WITHOUT isCorrect to avoid leaking answers into logs.
    const optionsSnapshot = question.options
      ? JSON.stringify(
          (JSON.parse(question.options) as Array<{ id: string; text: string; isCorrect: boolean }>)
            .map(({ id, text }) => ({ id, text }))
        )
      : null;

    responseRecords.push({
      attemptId,
      questionId: question.id,
      responseData: JSON.stringify(answer),
      isCorrect,
      marksAwarded,
      answeredAt: new Date(),
      questionTextSnapshot: question.text,
      questionOptionsSnapshot: optionsSnapshot,
      questionMarksSnapshot: question.marks,
      questionVersionSnapshot: question.version,
    });
  }

  // Persist responses
  await db.examResponse.createMany({ data: responseRecords });

  const percentageScore = totalObjectiveMarks > 0
    ? Math.round((rawScore / totalObjectiveMarks) * 100)
    : null;

  const passed = !hasManualQuestions && percentageScore !== null
    ? percentageScore >= examPaper.passMark
    : null; // null = pending manual grading

  const durationMins = attempt.startedAt
    ? Math.round((Date.now() - attempt.startedAt.getTime()) / 60000)
    : null;

  await db.examAttempt.update({
    where: { id: attemptId },
    data: {
      status: "COMPLETED",
      submittedAt: new Date(),
      rawScore,
      percentageScore,
      passed,
      durationMins,
    },
  });

  // Close proctoring session and gather incident summary
  const proctoringSession = await db.proctoringSession.findFirst({
    where: { attemptId },
    include: {
      incidents: {
        select: { type: true, severity: true, timestamp: true, description: true },
        orderBy: { timestamp: "asc" },
      },
    },
  });

  if (proctoringSession) {
    await db.proctoringSession.update({
      where: { id: proctoringSession.id },
      data: { status: "completed", endedAt: new Date() },
    });
  } else if (examPaper.requiresProctoring) {
    Sentry.captureMessage("Exam submitted without a proctoring session", {
      level: "warning",
      tags: { context: "exam-submit" },
      extra: { attemptId, examPaperId, userId: session.user.id },
    });
  }

  // Summarise violations by type for audit
  const incidentSummary: Record<string, number> = {};
  for (const inc of proctoringSession?.incidents ?? []) {
    incidentSummary[inc.type] = (incidentSummary[inc.type] ?? 0) + 1;
  }

  await auditLog({
    userId: session.user.id,
    action: "EXAM_SUBMITTED",
    entityType: "ExamAttempt",
    entityId: attemptId,
    metadata: {
      examPaperId,
      examTitle: examPaper.title,
      rawScore,
      percentageScore,
      passed,
      durationMins,
      hasManualQuestions,
      totalQuestions: allQuestions.length,
      totalViolations: proctoringSession?.incidents.length ?? 0,
      violationsByType: incidentSummary,
      proctoringSessionId: proctoringSession?.id ?? null,
      flagCount: proctoringSession?.flagCount ?? 0,
    },
  });

  // Send in-app notification with result
  if (!hasManualQuestions && percentageScore !== null) {
    await db.notification.create({
      data: {
        userId: session.user.id,
        type: "EXAM_RESULT",
        title: passed ? "Exam passed — congratulations!" : "Exam result available",
        message: passed
          ? `You scored ${percentageScore}% on "${examPaper.title}" and passed. Your result is now under review.`
          : `You scored ${percentageScore}% on "${examPaper.title}". The pass mark is ${examPaper.passMark}%. Review your results and, if eligible, attempt again.`,
        link: "/exams",
      },
    }).catch(() => {});
  } else if (hasManualQuestions) {
    await db.notification.create({
      data: {
        userId: session.user.id,
        type: "EXAM_SUBMITTED",
        title: "Exam submitted — awaiting grading",
        message: `Your submission for "${examPaper.title}" is complete. Results will be available once manual grading is finished.`,
        link: "/exams",
      },
    }).catch(() => {});
  }

  return NextResponse.json({ passed, percentageScore, rawScore, hasManualQuestions });
}
