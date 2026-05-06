import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import ApplicationReviewPage from "@/components/manage/ApplicationReviewPage";

export const metadata: Metadata = { title: "Scheme Applications" };

const OFFICER_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(OFFICER_ROLES as string[]).includes(session.user.role)) redirect("/dashboard");

  const applications = await db.schemeApplication.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      scheme: { select: { id: true, name: true, code: true } },
      course: { select: { id: true, title: true } },
    },
  });

  const serialised = applications.map((a) => ({
    id: a.id,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    candidate: {
      id: a.user.id,
      name: `${a.user.firstName} ${a.user.lastName}`,
      email: a.user.email,
    },
    scheme: { id: a.scheme.id, name: a.scheme.name, code: a.scheme.code },
    course: { id: a.course.id, title: a.course.title },
    applicationRef: `APP-${a.scheme.code}-${a.id.slice(-6).toUpperCase()}`,
    declarations: {
      declaredExperience: a.declaredExperience,
      declaredQualification: a.declaredQualification,
      priorCertNumbers: a.priorCertNumbers
        ? (JSON.parse(a.priorCertNumbers) as string[])
        : null,
      legalDeclarationAt: a.legalDeclarationAt?.toISOString() ?? null,
    },
    documents: {
      idDocumentUrl: a.idDocumentUrl,
      qualificationDocUrl: a.qualificationDocUrl,
      employerLetterUrl: a.employerLetterUrl,
    },
  }));

  return <ApplicationReviewPage applications={serialised} />;
}
