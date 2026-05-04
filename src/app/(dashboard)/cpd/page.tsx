import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import CPDLog from "@/components/cpd/CPDLog";

export const metadata: Metadata = { title: "CPD Log" };

export default async function CPDPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [records, schemes] = await Promise.all([
    db.cPDRecord.findMany({
      where: { userId: session.user.id },
      orderBy: { activityDate: "desc" },
      include: { scheme: { select: { name: true, code: true } } },
    }),
    db.certificationScheme.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, cpdHoursRequired: true },
    }),
  ]);

  // Aggregate hours per scheme
  const schemeTotals: Record<string, number> = {};
  for (const r of records) {
    if (r.schemeId) {
      schemeTotals[r.schemeId] = (schemeTotals[r.schemeId] ?? 0) + r.hoursLogged;
    }
  }

  const serialised = records.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    hoursLogged: r.hoursLogged,
    activityDate: r.activityDate.toISOString(),
    status: r.status,
    reviewNote: r.reviewNote,
    evidenceUrl: r.evidenceUrl,
    schemeId: r.schemeId,
    schemeName: r.scheme?.name ?? null,
    schemeCode: r.scheme?.code ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <CPDLog
      records={serialised}
      schemes={schemes}
      schemeTotals={schemeTotals}
    />
  );
}
