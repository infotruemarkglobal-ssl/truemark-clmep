import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getCachedSession as auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getReportsData } from "@/lib/reports";
import { auditLog } from "@/lib/audit";

// GET /api/reports/export — CSV download of exactly what /reports shows.
// Uses the same getReportsData() the on-screen dashboard calls (same
// session, same org-scoping), so the numbers in this file can never drift
// from what the requester was actually looking at.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "reports:read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { stats, schemeStats, monthlyEnrolments } = await getReportsData(session);

  const summaryRows = [
    { metric: "Active users", value: stats.totalUsers },
    { metric: "New users (last 30 days)", value: stats.newUsersLast30 },
    { metric: "Total enrolments", value: stats.totalEnrolments },
    { metric: "Active enrolments", value: stats.activeEnrolments },
    { metric: "Completed enrolments", value: stats.completedEnrolments },
    { metric: "Completed exam attempts", value: stats.totalAttempts },
    { metric: "Passed exam attempts", value: stats.passedAttempts },
    { metric: "Pass rate (%)", value: stats.passRate },
    { metric: "Total certificates", value: stats.totalCerts },
    { metric: "Active certificates", value: stats.activeCerts },
    { metric: "Expired certificates", value: stats.expiredCerts },
    { metric: "Revoked certificates", value: stats.revokedCerts },
    { metric: "Suspended certificates", value: stats.suspendedCerts },
    { metric: "CPD records pending review", value: stats.pendingCPD },
  ];

  const csv = [
    "Summary",
    Papa.unparse(summaryRows, { header: true }),
    "",
    "Certification scheme breakdown",
    Papa.unparse(
      schemeStats.map((s) => ({ scheme: s.name, code: s.code, certificates: s.certificates, examPapers: s.examPapers })),
      { header: true },
    ),
    "",
    "Monthly enrolments (last 6 months)",
    Papa.unparse(monthlyEnrolments, { header: true }),
  ].join("\n");

  await auditLog({
    userId: session.user.id,
    action: "REPORTS_EXPORTED",
    entityType: "Report",
    metadata: { format: "csv" },
  }).catch(() => {});

  const filename = `truemark-report-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
