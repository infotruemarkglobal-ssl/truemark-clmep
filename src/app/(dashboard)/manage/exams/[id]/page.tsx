import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import ExamEditor from "@/components/manage/ExamEditor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const paper = await db.examPaper.findFirst({ where: { id }, select: { title: true } });
  return { title: paper ? `Edit: ${paper.title}` : "Exam Editor" };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.EXAMINER];
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const paper = await db.examPaper.findFirst({
    where: { id },
    include: {
      scheme: { select: { id: true, name: true, code: true } },
      sections: {
        orderBy: { order: "asc" },
        include: {
          questions: {
            where: { isArchived: false },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!paper) notFound();

  const isAdmin = ([USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER] as string[]).includes(session.user.role);
  if (!isAdmin && paper.creatorId !== session.user.id) redirect("/manage/exams");

  const schemes = await db.certificationScheme.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
  });

  return (
    <ExamEditor
      paper={{
        id: paper.id,
        title: paper.title,
        description: paper.description,
        instructions: paper.instructions,
        durationMins: paper.durationMins,
        passMark: paper.passMark,
        totalMarks: paper.totalMarks,
        randomiseQuestions: paper.randomiseQuestions,
        randomiseOptions: paper.randomiseOptions,
        allowReview: paper.allowReview,
        requiresProctoring: paper.requiresProctoring,
        tabSwitchLimit: paper.tabSwitchLimit,
        isActive: paper.isActive,
        scheme: paper.scheme,
        sections: paper.sections.map((s) => ({
          id: s.id,
          title: s.title,
          instructions: s.instructions,
          order: s.order,
          questions: s.questions.map((q) => ({
            id: q.id,
            type: q.type,
            text: q.text,
            marks: q.marks,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            domain: q.domain,
            difficulty: q.difficulty,
          })),
        })),
      }}
      schemes={schemes}
    />
  );
}
