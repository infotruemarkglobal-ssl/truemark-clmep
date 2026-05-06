import { notFound, redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ExamLanding from "@/components/exams/ExamLanding";
import ExamClientWrapper from "@/components/exams/ExamClientWrapper";

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const examPaper = await db.examPaper.findFirst({
    where: { id, isActive: true },
    include: {
      scheme: true,
      sections: {
        orderBy: { order: "asc" },
        include: { questions: { where: { isArchived: false } } },
      },
    },
  });
  if (!examPaper) notFound();

  // Check if there's an in-progress attempt — resume it
  const inProgressAttempt = await db.examAttempt.findFirst({
    where: { userId: session.user.id, examPaperId: id, status: "IN_PROGRESS" },
    include: {
      responses: true,
      proctoringSession: true,
    },
  });

  const totalQuestions = examPaper.sections.reduce((sum, s) => sum + s.questions.length, 0);
  const durationMins = examPaper.durationMins;
  const maxAttempts = examPaper.scheme?.maxAttempts ?? 3;
  const passMark = examPaper.passMark;

  if (inProgressAttempt && inProgressAttempt.proctoringSession) {
    const allQuestions = examPaper.sections.flatMap((s) =>
      s.questions.map((q) => ({
        id: q.id,
        questionText: q.text,
        questionType: q.type as "MCQ" | "true_false" | "fill_blank" | "essay" | "drag_drop",
        options: q.options
          ? (JSON.parse(q.options) as { id: string; text: string; isCorrect?: boolean }[]).map(({ id: oid, text }) => ({ id: oid, text }))
          : [],
        marks: q.marks,
        order: 0,
      }))
    );

    return (
      <ExamClientWrapper
        examState={{
          attemptId: inProgressAttempt.id,
          examPaperId: examPaper.id,
          proctoringSessionId: inProgressAttempt.proctoringSession.id,
          questions: allQuestions,
          timeLimitMins: durationMins,
          startedAt: (inProgressAttempt.startedAt ?? new Date()).toISOString(),
          requiresProctoring: examPaper.requiresProctoring,
          tabSwitchLimit: examPaper.tabSwitchLimit,
        }}
        examTitle={examPaper.title}
        passMark={passMark}
      />
    );
  }

  // Find enrolment — used for eligibility check and scoping attempt count to current period.
  const enrolment = examPaper.scheme
    ? await db.enrolment.findFirst({
        where: {
          userId: session.user.id,
          course: { schemeId: examPaper.scheme.id },
          status: { in: ["ACTIVE", "COMPLETED"] },
        },
        include: {
          course: { select: { id: true, title: true, price: true, currency: true } },
        },
      })
    : null;
  const isEligible = !!enrolment;

  // Count attempts only within the current enrolment period so re-enrolment resets the count.
  const previousAttempts = await db.examAttempt.count({
    where: {
      userId: session.user.id,
      examPaperId: id,
      ...(enrolment ? { createdAt: { gte: enrolment.enroledAt } } : {}),
    },
  });

  const questionTypes = [
    ...new Set(examPaper.sections.flatMap((s) => s.questions.map((q) => q.type))),
  ];

  return (
    <ExamLanding
      examPaper={{
        id: examPaper.id,
        title: examPaper.title,
        timeLimitMins: durationMins,
        passMark,
        maxAttempts,
        scheme: examPaper.scheme ? { name: examPaper.scheme.name, code: examPaper.scheme.code } : null,
        totalQuestions,
        requiresProctoring: examPaper.requiresProctoring,
        tabSwitchLimit: examPaper.tabSwitchLimit,
      }}
      previousAttempts={previousAttempts}
      isEligible={isEligible}
      course={enrolment?.course ?? null}
      questionTypes={questionTypes}
    />
  );
}
