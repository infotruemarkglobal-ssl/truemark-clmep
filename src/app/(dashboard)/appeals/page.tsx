import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import AppealsPage from "@/components/appeals/AppealsPage";

export const metadata: Metadata = { title: "Appeals" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];
  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);

  const appeals = await db.appeal.findMany({
    where: isAdmin ? undefined : { userId: session.user.id },
    orderBy: { submittedAt: "desc" },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  // For candidates, get their failed exam attempts to reference in appeals
  const examAttempts = isAdmin
    ? []
    : await db.examAttempt.findMany({
        where: { userId: session.user.id, status: "COMPLETED", deletedAt: null },
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          percentageScore: true,
          submittedAt: true,
          examPaper: { select: { title: true } },
        },
      });

  const serialised = appeals.map((a) => ({
    id: a.id,
    reference: a.reference,
    type: a.type,
    subjectId: a.subjectId,
    description: a.description,
    evidenceUrls: a.evidenceUrls,
    status: a.status,
    resolution: a.resolution,
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    submittedAt: a.submittedAt.toISOString(),
    user: a.user,
  }));

  const serialisedAttempts = examAttempts.map((a) => ({
    id: a.id,
    examTitle: a.examPaper.title,
    percentageScore: a.percentageScore,
    submittedAt: a.submittedAt?.toISOString() ?? null,
  }));

  return (
    <AppealsPage
      appeals={serialised}
      examAttempts={serialisedAttempts}
      isAdmin={isAdmin}
    />
  );
}
