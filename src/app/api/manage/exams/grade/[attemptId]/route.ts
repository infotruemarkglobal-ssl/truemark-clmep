import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.EXAMINER];

// Vercel Pro required for maxDuration > 10.
// Grade submission involves multiple DB writes and Inngest event.
export const maxDuration = 60; // seconds

// ── GET /api/manage/exams/grade/[attemptId] ───────────────────────────────────
// Returns the attempt's essay/manual responses for grading, deliberately
// omitting all candidate identity fields (blind marking by default).
// MEDIUM fix: the ExamGrade.blindMarking schema flag previously had no enforcement.
// This route structurally prevents identity leakage — the examiner cannot see
// userId, firstName, lastName, email, or any PII from this response.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { attemptId } = await params;

  // Fetch only what the grader needs — candidate identity columns are excluded.
  // Prisma select ensures the query never returns PII to this route handler,
  // so an accidental serialisation bug cannot leak it in a response.
  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId, status: "COMPLETED" },
    select: {
      id: true,
      examPaperId: true,
      attemptNumber: true,
      startedAt: true,
      submittedAt: true,
      durationMins: true,
      rawScore: true,
      percentageScore: true,
      passed: true,
      // userId intentionally omitted — blind marking
      examPaper: {
        select: {
          id: true,
          title: true,
          passMark: true,
          totalMarks: true,
          sections: {
            select: {
              title: true,
              questions: {
                where: { isArchived: false },
                select: {
                  id: true,
                  type: true,
                  text: true,
                  marks: true,
                  domain: true,
                  // options and correctAnswer intentionally omitted from grading view
                  // — the examiner grades free-text responses, not validates MCQ choices
                },
              },
            },
          },
        },
      },
      responses: {
        select: {
          id: true,
          questionId: true,
          responseData: true,
          marksAwarded: true,
          isCorrect: true,
          answeredAt: true,
        },
      },
      grade: {
        select: {
          id: true,
          rawScore: true,
          percentageScore: true,
          passed: true,
          feedbackNotes: true,
          blindMarking: true,
          gradedAt: true,
          // examinerId intentionally omitted to avoid bias if another examiner reviews
        },
      },
      proctoringSession: {
        select: {
          id: true,
          flagCount: true,
          status: true,
          incidents: {
            select: { type: true, severity: true, timestamp: true, description: true },
            where: { severity: { in: ["high", "medium"] } },
            orderBy: { timestamp: "asc" },
          },
        },
      },
    },
  });

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found or not yet submitted" }, { status: 404 });
  }

  // Filter to only manual-grading question types (essay, drag_drop)
  const manualTypes = new Set(["essay", "drag_drop", "fill_blank"]);
  const questionById = new Map(
    attempt.examPaper?.sections.flatMap((s) => s.questions).map((q) => [q.id, q]) ?? []
  );
  const manualResponses = attempt.responses.filter((r) => {
    const question = questionById.get(r.questionId);
    return question && manualTypes.has(question.type) && r.isCorrect === null;
  });

  await auditLog({
    userId: session.user.id,
    action: "EXAM_GRADING_ACCESSED",
    entityType: "ExamAttempt",
    entityId: attemptId,
    metadata: { blindMarking: true },
  });

  return NextResponse.json({
    attemptId: attempt.id,
    examPaper: attempt.examPaper,
    attemptMeta: {
      attemptNumber: attempt.attemptNumber,
      durationMins: attempt.durationMins,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
    },
    manualResponses,
    autoGradeScore: attempt.rawScore,
    alreadyGraded: !!attempt.grade,
    existingGrade: attempt.grade ?? null,
    proctoringFlags: attempt.proctoringSession ?? null,
    // Explicitly document that candidate identity has been withheld
    blindMarking: true,
  });
}

// ── POST /api/manage/exams/grade/[attemptId] ──────────────────────────────────
// Submit a manual grade for an attempt.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { attemptId } = await params;

  const schema = z.object({
    manualScores: z.record(
      z.string(), // questionId
      z.number().min(0).max(500) // marks awarded
    ),
    feedbackNotes: z.string().max(5000).optional(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId, status: "COMPLETED" },
    include: {
      examPaper: {
        include: { sections: { include: { questions: true } } },
      },
      grade: true,
    },
  });

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found or not submitted" }, { status: 404 });
  }
  if (attempt.grade) {
    return NextResponse.json({ error: "This attempt has already been graded" }, { status: 409 });
  }

  // ISO 17024 Cl.7.4 — examiner must not be the candidate
  if (attempt.userId === session.user.id) {
    return NextResponse.json({ error: "Forbidden — you cannot grade your own attempt" }, { status: 403 });
  }

  const allQuestions = attempt.examPaper.sections.flatMap((s) => s.questions);

  // Validate that submitted questionIds exist and marks don't exceed question max
  for (const [questionId, marksAwarded] of Object.entries(body.data.manualScores)) {
    const question = allQuestions.find((q) => q.id === questionId);
    if (!question) {
      return NextResponse.json({ error: `Unknown questionId: ${questionId}` }, { status: 400 });
    }
    if (marksAwarded > question.marks) {
      return NextResponse.json(
        { error: `Marks awarded (${marksAwarded}) exceed question max (${question.marks}) for question ${questionId}` },
        { status: 400 }
      );
    }
  }

  // Update individual response records with examiner's marks
  await db.$transaction(
    Object.entries(body.data.manualScores).map(([questionId, marksAwarded]) =>
      db.examResponse.updateMany({
        where: { attemptId, questionId },
        data: { marksAwarded, isCorrect: marksAwarded > 0 },
      })
    )
  );

  // Recalculate total score (auto-graded objective + manual)
  const allResponses = await db.examResponse.findMany({ where: { attemptId } });
  const totalRaw = allResponses.reduce((sum, r) => sum + (r.marksAwarded ?? 0), 0);
  const totalMarks = attempt.examPaper.totalMarks;
  const percentageScore = Math.round((totalRaw / totalMarks) * 100);
  const passed = percentageScore >= attempt.examPaper.passMark;

  const [grade] = await db.$transaction([
    db.examGrade.create({
      data: {
        attemptId,
        examinerId: session.user.id,
        rawScore: totalRaw,
        percentageScore,
        passed,
        feedbackNotes: body.data.feedbackNotes ?? null,
        blindMarking: true, // always true for this route
      },
    }),
    db.examAttempt.update({
      where: { id: attemptId },
      data: { rawScore: totalRaw, percentageScore, passed, gradeReleased: false },
    }),
  ]);

  await auditLog({
    userId: session.user.id,
    action: "EXAM_GRADED",
    entityType: "ExamAttempt",
    entityId: attemptId,
    metadata: {
      gradeId: grade.id,
      totalRaw,
      percentageScore,
      passed,
      blindMarking: true,
    },
  });

  return NextResponse.json({ grade }, { status: 201 });
}

// ── PATCH /api/manage/exams/grade/[attemptId] ─────────────────────────────────
// Release a grade to the candidate. Sets gradeReleased = true and dispatches
// the exam-result email via Inngest (fire-and-forget, idempotent).
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { attemptId } = await params;

  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      grade: true,
      user: { select: { id: true, email: true, firstName: true } },
      examPaper: { select: { title: true } },
    },
  });

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (!attempt.grade) {
    return NextResponse.json({ error: "Attempt has not been graded yet" }, { status: 409 });
  }
  if (attempt.gradeReleased) {
    // Idempotent — releasing an already-released grade is a no-op
    return NextResponse.json({ released: true, alreadyReleased: true });
  }

  await db.examAttempt.update({
    where: { id: attemptId },
    data: { gradeReleased: true },
  });

  await auditLog({
    userId: session.user.id,
    action: "EXAM_GRADE_RELEASED",
    entityType: "ExamAttempt",
    entityId: attemptId,
    metadata: {
      candidateId: attempt.userId,
      passed: attempt.grade.passed,
      percentageScore: attempt.grade.percentageScore,
    },
  });

  // Dispatch the exam result email as a background job.
  // Idempotency key: stable per (attemptId) — if this route is called twice
  // for the same attempt, Inngest deduplicates the event within 24 hours.
  await inngest.send({
    id: `exam-result-${attemptId}`,
    name: EVENTS.SEND_EXAM_RESULT,
    data: {
      to: attempt.user.email,
      firstName: attempt.user.firstName,
      examTitle: attempt.examPaper.title,
      passed: attempt.grade.passed,
      score: attempt.grade.percentageScore,
      attemptId,
      // userId passed so the Inngest function can generate the per-user
      // unsubscribe token if ever needed (exam result is transactional,
      // no unsubscribe required, but the schema accepts it for future-proofing).
      userId: attempt.user.id,
    },
  });

  return NextResponse.json({ released: true });
}
