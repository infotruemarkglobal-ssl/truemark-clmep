import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import CPDLog from "@/components/cpd/CPDLog";

export const metadata: Metadata = { title: "My CPD Portfolio" };

export default async function CPDPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const thisYear = new Date(new Date().getFullYear(), 0, 1);

  const [records, schemes, certificates] = await Promise.all([
    db.cPDRecord.findMany({
      where: { userId: session.user.id },
      orderBy: { activityDate: "desc" },
      include: { scheme: { select: { name: true, code: true } } },
    }),
    db.certificationScheme.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, cpdHoursRequired: true },
    }),
    db.certificate.findMany({
      where: { userId: session.user.id, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        certificateNumber: true,
        expiresAt: true,
        issuedAt: true,
        schemeId: true,
        schemeNameSnapshot: true,
        schemeCodeSnapshot: true,
        scheme: {
          select: { id: true, name: true, code: true, cpdHoursRequired: true, validityMonths: true },
        },
      },
    }),
  ]);

  // Approved hours toward each scheme (all time) — used for renewal progress
  const schemeTotals: Record<string, number> = {};
  for (const r of records) {
    if (r.schemeId && r.status === "approved") {
      schemeTotals[r.schemeId] = (schemeTotals[r.schemeId] ?? 0) + r.hoursLogged;
    }
  }

  // Total approved hours logged this calendar year
  const hoursThisYear = records
    .filter((r) => r.status === "approved" && new Date(r.activityDate) >= thisYear)
    .reduce((s, r) => s + r.hoursLogged, 0);

  const serialisedRecords = records.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    activityType: r.activityType,
    hoursLogged: r.hoursLogged,
    activityDate: r.activityDate.toISOString(),
    status: r.status,
    reviewNote: r.reviewNote,
    evidenceUrl: r.evidenceUrl,
    schemeId: r.schemeId,
    schemeName: r.scheme?.name ?? null,
    schemeCode: r.scheme?.code ?? null,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  const serialisedCerts = certificates.map((c) => ({
    id: c.id,
    certificateNumber: c.certificateNumber,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    issuedAt: c.issuedAt.toISOString(),
    schemeId: c.schemeId,
    schemeName: c.schemeNameSnapshot ?? c.scheme?.name ?? null,
    schemeCode: c.schemeCodeSnapshot ?? c.scheme?.code ?? null,
    cpdHoursRequired: c.scheme?.cpdHoursRequired ?? 0,
    validityMonths: c.scheme?.validityMonths ?? 0,
    hoursLogged: c.schemeId ? (schemeTotals[c.schemeId] ?? 0) : 0,
  }));

  return (
    <CPDLog
      records={serialisedRecords}
      schemes={schemes}
      schemeTotals={schemeTotals}
      certificates={serialisedCerts}
      hoursThisYear={hoursThisYear}
    />
  );
}
