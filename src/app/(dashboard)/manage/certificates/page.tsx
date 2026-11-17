import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { can } from "@/lib/permissions";
import ManageCertificatesPage from "@/components/manage/ManageCertificatesPage";

export const metadata: Metadata = { title: "Manage Certificates" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // certifications:read is granted broadly (CANDIDATE holds it too, for
  // viewing their own certs) — this page has no ownership scoping at all
  // (queries every certificate system-wide), so a bare check here would let
  // any certifications:read holder see every candidate's name, email, and
  // certificate record. Ceiling matches this page's original ALLOWED list.
  if (!(await can(session, "certifications:read", ["SUPER_ADMIN", "CERTIFICATION_OFFICER", "AUDITOR"]))) redirect("/dashboard");

  const { status, cursor } = await searchParams;
  const PAGE_SIZE = 25;

  const certificates = await db.certificate.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status } : {}),
    },
    orderBy: { issuedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      scheme: { select: { name: true, code: true } },
    },
  });

  const hasMore = certificates.length > PAGE_SIZE;
  const page = hasMore ? certificates.slice(0, PAGE_SIZE) : certificates;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  // Surveillance is a separate, parallel state to Certificate.status (a cert
  // stays ACTIVE while under surveillance) — batch-fetch which of these
  // certs have an open review rather than an N+1 per row.
  const openReviews = await db.surveillanceReview.findMany({
    where: { certificateId: { in: page.map((c) => c.id) }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
    select: { certificateId: true },
  });
  const underSurveillance = new Set(openReviews.map((r) => r.certificateId));

  const serialised = page.map((c) => ({
    id: c.id,
    certificateNumber: c.certificateNumber,
    status: c.status,
    issuedAt: c.issuedAt.toISOString(),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    holderName: `${c.user.firstName} ${c.user.lastName}`,
    holderEmail: c.user.email,
    holderId: c.user.id,
    schemeName: c.scheme.name,
    schemeCode: c.scheme.code,
    underSurveillance: underSurveillance.has(c.id),
  }));

  return (
    <ManageCertificatesPage
      certificates={serialised}
      nextCursor={nextCursor}
      currentStatus={status ?? null}
      isReadOnly={session.user.role === USER_ROLES.AUDITOR}
    />
  );
}
