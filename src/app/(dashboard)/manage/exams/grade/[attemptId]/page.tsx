import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import GradingForm from "@/components/exams/GradingForm";

export const metadata: Metadata = { title: "Grade Exam Attempt" };

// essay and fill_blank require human scoring; all other types are auto-scored.
const MANUAL_TYPES = new Set(["essay", "fill_blank"]);

const ALLOWED = [USER_ROLES.EXAMINER, USER_ROLES.SUPER_ADMIN];

export default async function Page({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const { attemptId } = await params;

  // userId is intentionally excluded from every select — blind grading requires
  // that candidate identity never reaches the server component or the client.
  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId, status: "COMPLETED", deletedAt: null },
    select: {
      id: true,
      attemptNumber: true,
      submittedAt: true,
      gradeReleased: true,
      examPaper: {
        select: {
          title: true,
          passMark: true,
          totalMarks: true,
          sections: {
            select: {
              title: true,
              questions: {
                where: { isArchived: false },
                select: { id: true, type: true, text: true, marks: true },
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
          // ISO 17024 Cl.6.1: use snapshot fields so the examiner grades
          // against the exact question wording the candidate saw, even if
          // the live question was edited after the attempt was submitted.
          questionTextSnapshot: true,
          questionMarksSnapshot: true,
        },
      },
      grade: {
        select: {
          rawScore: true,
          percentageScore: true,
          passed: true,
          feedbackNotes: true,
          gradedAt: true,
          // examinerId intentionally omitted to avoid bias if a second
          // examiner reviews the same attempt.
        },
      },
    },
  });

  // Redirect if not found or not yet submitted (guards against direct URL access).
  if (!attempt) redirect("/manage/exams");

  const responseMap = new Map(attempt.responses.map((r) => [r.questionId, r]));

  const manualQuestions: {
    questionId: string;
    type: "essay" | "fill_blank";
    text: string;
    marks: number;
    sectionTitle: string;
    responseData: string | null;
    marksAwarded: number | null;
  }[] = [];

  const autoQuestions: {
    questionId: string;
    type: string;
    text: string;
    marks: number;
    sectionTitle: string;
    marksAwarded: number | null;
    isCorrect: boolean | null;
  }[] = [];

  for (const section of attempt.examPaper.sections) {
    for (const q of section.questions) {
      const r = responseMap.get(q.id);
      // Prefer the snapshot taken at attempt-start; fall back to the live row.
      const text = r?.questionTextSnapshot ?? q.text;
      const marks = r?.questionMarksSnapshot ?? q.marks;

      if (MANUAL_TYPES.has(q.type)) {
        manualQuestions.push({
          questionId: q.id,
          type: q.type as "essay" | "fill_blank",
          text,
          marks,
          sectionTitle: section.title,
          responseData: r?.responseData ?? null,
          marksAwarded: r?.marksAwarded ?? null,
        });
      } else {
        autoQuestions.push({
          questionId: q.id,
          type: q.type,
          text,
          marks,
          sectionTitle: section.title,
          marksAwarded: r?.marksAwarded ?? null,
          isCorrect: r?.isCorrect ?? null,
        });
      }
    }
  }

  const existingGrade = attempt.grade
    ? {
        rawScore: attempt.grade.rawScore,
        percentageScore: attempt.grade.percentageScore,
        passed: attempt.grade.passed,
        feedbackNotes: attempt.grade.feedbackNotes,
        gradedAt: attempt.grade.gradedAt.toISOString(),
      }
    : null;

  return (
    <GradingForm
      attemptId={attempt.id}
      examTitle={attempt.examPaper.title}
      attemptNumber={attempt.attemptNumber}
      submittedAt={attempt.submittedAt?.toISOString() ?? null}
      totalMarks={attempt.examPaper.totalMarks}
      passMark={attempt.examPaper.passMark}
      alreadyGraded={!!attempt.grade}
      gradeReleased={attempt.gradeReleased}
      existingGrade={existingGrade}
      manualQuestions={manualQuestions}
      autoQuestions={autoQuestions}
    />
  );
}
