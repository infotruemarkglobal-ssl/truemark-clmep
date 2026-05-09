import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import NewAppealForm from "@/components/appeals/NewAppealForm";

export const metadata: Metadata = { title: "Submit an Appeal" };

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Admins manage appeals — they do not submit them via this form.
  if ((ADMIN_ROLES as string[]).includes(session.user.role)) redirect("/appeals");

  const [examAttempts, certificates] = await Promise.all([
    db.examAttempt.findMany({
      where: { userId: session.user.id, status: "COMPLETED", deletedAt: null },
      orderBy: { submittedAt: "desc" },
      take: 20,
      select: {
        id: true,
        percentageScore: true,
        submittedAt: true,
        examPaper: { select: { title: true } },
      },
    }),
    db.certificate.findMany({
      where: { userId: session.user.id, status: "ACTIVE", deletedAt: null },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        issuedAt: true,
        scheme: { select: { name: true } },
      },
    }),
  ]);

  const serialisedAttempts = examAttempts.map((a) => ({
    id: a.id,
    examTitle: a.examPaper.title,
    percentageScore: a.percentageScore,
    submittedAt: a.submittedAt?.toISOString() ?? null,
  }));

  const serialisedCerts = certificates.map((c) => ({
    id: c.id,
    schemeName: c.scheme.name,
    issuedAt: c.issuedAt.toISOString(),
  }));

  return <NewAppealForm examAttempts={serialisedAttempts} certificates={serialisedCerts} />;
}
