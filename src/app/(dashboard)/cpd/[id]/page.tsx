import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import CPDRecordReview from "@/components/cpd/CPDRecordReview";

export const metadata: Metadata = { title: "Review CPD Record" };

// CANDIDATE also holds cpd:manage (for their own CPD log) — ADMIN_ROLES is a
// hard ceiling on top of the grant so a candidate can't view/act on someone
// else's record, matching this page's original ADMIN_ROLES exclusivity.
const ADMIN_ROLES = ["SUPER_ADMIN", "CERTIFICATION_OFFICER"];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const isAdmin = await can(session, "cpd:manage", ADMIN_ROLES);

  const record = await db.cPDRecord.findUnique({
    where: { id },
    include: {
      scheme: { select: { id: true, name: true, code: true, cpdHoursRequired: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!record) notFound();
  if (!isAdmin && record.userId !== session.user.id) redirect("/cpd");

  const serialised = {
    id: record.id,
    title: record.title,
    type: record.type,
    hoursLogged: record.hoursLogged,
    activityDate: record.activityDate.toISOString(),
    status: record.status,
    reviewNote: record.reviewNote,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    evidenceUrl: record.evidenceUrl,
    createdAt: record.createdAt.toISOString(),
    scheme: record.scheme
      ? { id: record.scheme.id, name: record.scheme.name, code: record.scheme.code, cpdHoursRequired: record.scheme.cpdHoursRequired }
      : null,
    holder: { id: record.user.id, name: `${record.user.firstName} ${record.user.lastName}`, email: record.user.email },
  };

  return <CPDRecordReview record={serialised} isAdmin={isAdmin} />;
}
