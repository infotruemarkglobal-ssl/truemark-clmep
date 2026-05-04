import type { Metadata } from "next";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ExamList from "@/components/exams/ExamList";

export const metadata: Metadata = { title: "Certification Exams" };

type EligibleCourse = {
  id: string;
  title: string;
  slug: string;
  progress: number;
  examPaper: {
    id: string;
    title: string;
    timeLimitMins: number;
    passMark: number;
    maxAttempts: number;
    scheme: { name: string; code: string } | null;
    _count: { questions: number };
  };
};

export default async function ExamsPage() {
  const session = await auth();
  if (!session?.user) return null;

  // Fetch enrolments and past attempts in parallel — independent queries.
  const [enrolments, attempts] = await Promise.all([
    db.enrolment.findMany({
      where: { userId: session.user.id, status: { in: ["ACTIVE", "COMPLETED"] } },
      include: {
        course: {
          select: {
            id: true, title: true, slug: true,
            minProgressToExam: true,
            scheme: { select: { id: true, name: true, code: true, maxAttempts: true } },
          },
        },
      },
    }),
    db.examAttempt.findMany({
      where: { userId: session.user.id, deletedAt: null },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        examPaperId: true,
        status: true,
        percentageScore: true,
        passed: true,
        startedAt: true,
        submittedAt: true,
      },
    }),
  ]);

  // Filter to courses the candidate has completed enough progress on,
  // then collect the scheme IDs they're eligible to sit.
  const eligibleEnrolments = enrolments.filter(
    (e) => e.course.scheme && e.progress >= e.course.minProgressToExam
  );
  const schemeIds = [...new Set(eligibleEnrolments.map((e) => e.course.scheme!.id))];

  // Single batch query for all exam papers — replaces the previous N+1 loop
  // (one db.examPaper.findFirst per eligible course → one per request now).
  const examPapers = schemeIds.length
    ? await db.examPaper.findMany({
        where: { schemeId: { in: schemeIds }, isActive: true },
        include: {
          scheme: { select: { name: true, code: true, maxAttempts: true } },
          sections: { include: { _count: { select: { questions: true } } } },
        },
      })
    : [];

  // Index by schemeId; keep the first active paper per scheme.
  const paperByScheme = new Map(examPapers.map((p) => [p.schemeId, p]));

  const eligibleCourses: EligibleCourse[] = [];
  for (const enrolment of eligibleEnrolments) {
    const course = enrolment.course;
    const examPaper = paperByScheme.get(course.scheme!.id);
    if (!examPaper) continue;

    const totalQuestions = examPaper.sections.reduce(
      (sum, s) => sum + s._count.questions,
      0
    );

    eligibleCourses.push({
      id: course.id,
      title: course.title,
      slug: course.slug,
      progress: enrolment.progress,
      examPaper: {
        id: examPaper.id,
        title: examPaper.title,
        timeLimitMins: examPaper.durationMins,
        passMark: examPaper.passMark,
        maxAttempts: examPaper.scheme?.maxAttempts ?? 3,
        scheme: examPaper.scheme
          ? { name: examPaper.scheme.name, code: examPaper.scheme.code }
          : null,
        _count: { questions: totalQuestions },
      },
    });
  }

  const serialisedAttempts = attempts.map((a) => ({
    id: a.id,
    examPaperId: a.examPaperId,
    status: a.status,
    score: a.percentageScore,
    passed: a.passed,
    startedAt: a.startedAt?.toISOString() ?? new Date().toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null,
  }));

  return <ExamList eligibleCourses={eligibleCourses} attempts={serialisedAttempts} />;
}
