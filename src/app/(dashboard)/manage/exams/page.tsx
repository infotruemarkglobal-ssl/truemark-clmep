import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import ManageExamsPage from "@/components/manage/ManageExamsPage";

export const metadata: Metadata = { title: "Manage Exam Papers" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.EXAMINER];
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const isSuperAdmin = ([USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER] as string[]).includes(session.user.role);

  const [papers, schemes] = await Promise.all([
    db.examPaper.findMany({
      where: isSuperAdmin ? undefined : { creatorId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { firstName: true, lastName: true } },
        scheme: { select: { name: true, code: true } },
        sections: {
          include: {
            _count: { select: { questions: true } },
          },
        },
        _count: { select: { attempts: true } },
      },
    }),
    db.certificationScheme.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const serialised = papers.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    durationMins: p.durationMins,
    passMark: p.passMark,
    totalMarks: p.totalMarks,
    isActive: p.isActive,
    requiresProctoring: p.requiresProctoring,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    creator: p.creator,
    scheme: p.scheme,
    sectionCount: p.sections.length,
    questionCount: p.sections.reduce((sum, s) => sum + s._count.questions, 0),
    attemptCount: p._count.attempts,
  }));

  return <ManageExamsPage papers={serialised} schemes={schemes} />;
}
