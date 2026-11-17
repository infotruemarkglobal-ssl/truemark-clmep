import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import ApplicationReviewPage from "@/components/manage/ApplicationReviewPage";

export const metadata: Metadata = { title: "Scheme Applications" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session, "applications:read"))) redirect("/dashboard");

  const applications = await db.schemeApplication.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      scheme: { select: { id: true, name: true, code: true } },
      course: { select: { id: true, title: true } },
    },
  });

  // Automated primary-source verification: a declared prior-cert number is
  // free text a candidate typed — it could be a real Truemark certificate,
  // one from another body Truemark has no record of, or simply wrong. Look
  // every declared number up against the real Certificate table (one batch
  // query, not N) instead of leaving it as an inert string a reviewer must
  // trust blind.
  const declaredNumbers = [
    ...new Set(
      applications.flatMap((a) => (a.priorCertNumbers ? (JSON.parse(a.priorCertNumbers) as string[]) : [])),
    ),
  ];
  const verifiedCerts = declaredNumbers.length
    ? await db.certificate.findMany({
        where: { certificateNumber: { in: declaredNumbers }, status: "ACTIVE", deletedAt: null },
        select: { certificateNumber: true, scheme: { select: { name: true } } },
      })
    : [];
  const verifiedMap = new Map(verifiedCerts.map((c) => [c.certificateNumber, c.scheme.name]));

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
        ? (JSON.parse(a.priorCertNumbers) as string[]).map((number) => ({
            number,
            verified: verifiedMap.has(number),
            verifiedSchemeName: verifiedMap.get(number) ?? null,
          }))
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
