import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ExamResult from "@/components/exams/ExamResult";

export const metadata: Metadata = { title: "Exam Result" };

export default async function ExamResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId, userId: session.user.id },
    include: {
      examPaper: {
        include: { scheme: true },
      },
      responses: {
        include: { question: true },
      },
    },
  });

  if (!attempt) notFound();
  if (attempt.status === "IN_PROGRESS") {
    redirect(`/exams/${attempt.examPaperId}`);
  }

  const maxAttempts = attempt.examPaper.scheme?.maxAttempts ?? 3;
  const [attemptCount, relatedCourse] = await Promise.all([
    db.examAttempt.count({
      where: { userId: session.user.id, examPaperId: attempt.examPaperId },
    }),
    // Find the course the candidate was enrolled in that is linked to this exam's scheme
    attempt.examPaper.schemeId
      ? db.course.findFirst({
          where: { schemeId: attempt.examPaper.schemeId },
          select: { slug: true },
        })
      : Promise.resolve(null),
  ]);
  const attemptsLeft = Math.max(0, maxAttempts - attemptCount);

  return (
    <ExamResult
      attempt={{
        id: attempt.id,
        examPaperId: attempt.examPaperId,
        status: attempt.status,
        score: attempt.percentageScore,
        passed: attempt.passed,
        startedAt: attempt.startedAt?.toISOString() ?? new Date().toISOString(),
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        examPaper: {
          title: attempt.examPaper.title,
          passMark: attempt.examPaper.passMark,
          timeLimitMins: attempt.examPaper.durationMins,
          scheme: attempt.examPaper.scheme
            ? { name: attempt.examPaper.scheme.name, code: attempt.examPaper.scheme.code }
            : null,
        },
        responseSummary: attempt.responses.map((r) => ({
          questionId: r.questionId,
          questionText: r.question.text,
          questionType: r.question.type,
          marks: r.question.marks,
          isCorrect: r.isCorrect,
          marksAwarded: r.marksAwarded,
        })),
      }}
      attemptsLeft={attemptsLeft}
      courseSlug={relatedCourse?.slug ?? null}
    />
  );
}
