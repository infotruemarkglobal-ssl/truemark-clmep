import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { getPermissionOrgScope } from "@/lib/permissions";

// Shared by src/app/(dashboard)/reports/page.tsx (the on-screen dashboard)
// and src/app/api/reports/export/route.ts (the CSV download) — one query
// set, so the export is guaranteed to show exactly what the screen shows,
// scoped the same way, never a separately-computed number that could drift.
export async function getReportsData(session: Session) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // HIGH-4 RBAC fix, generalised: scope to org membership whenever
  // reports:read is only held via an org (ORG_MANAGER's own org, or an
  // org-scoped custom role) — not just for the literal ORG_MANAGER role.
  const orgIds = await getPermissionOrgScope(session, "reports:read");
  let orgUserIds: string[] | null = null;
  if (orgIds !== null) {
    const members = await db.organisationMember.findMany({
      where: { organisationId: { in: orgIds } },
      select: { userId: true },
    });
    orgUserIds = members.map((m) => m.userId);
  }

  const userScope = orgUserIds !== null ? { id: { in: orgUserIds } } : {};
  const enrolScope = orgUserIds !== null ? { userId: { in: orgUserIds } } : {};
  const attemptScope = orgUserIds !== null ? { userId: { in: orgUserIds } } : {};
  const certScope = orgUserIds !== null ? { userId: { in: orgUserIds } } : {};
  const cpdScope = orgUserIds !== null ? { userId: { in: orgUserIds } } : {};

  const [
    totalUsers,
    newUsersLast30,
    totalEnrolments,
    activeEnrolments,
    completedEnrolments,
    totalAttempts,
    passedAttempts,
    totalCerts,
    activeCerts,
    expiredCerts,
    revokedCerts,
    suspendedCerts,
    pendingCPD,
    schemeStats,
  ] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE", ...userScope } }),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo }, ...userScope } }),
    db.enrolment.count({ where: enrolScope }),
    db.enrolment.count({ where: { status: "ACTIVE", ...enrolScope } }),
    db.enrolment.count({ where: { status: "COMPLETED", ...enrolScope } }),
    db.examAttempt.count({ where: { status: "COMPLETED", deletedAt: null, ...attemptScope } }),
    db.examAttempt.count({ where: { status: "COMPLETED", passed: true, deletedAt: null, ...attemptScope } }),
    db.certificate.count({ where: { deletedAt: null, ...certScope } }),
    db.certificate.count({ where: { status: "ACTIVE", deletedAt: null, ...certScope } }),
    db.certificate.count({ where: { status: "EXPIRED", deletedAt: null, ...certScope } }),
    db.certificate.count({ where: { status: "REVOKED", deletedAt: null, ...certScope } }),
    db.certificate.count({ where: { status: "SUSPENDED", deletedAt: null, ...certScope } }),
    db.cPDRecord.count({ where: { status: "pending", ...cpdScope } }),
    db.certificationScheme.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        _count: { select: { certificates: true, examPapers: true } },
      },
    }),
  ]);

  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const recentEnrolments = await db.enrolment.findMany({
    where: { enroledAt: { gte: sixMonthsAgo }, ...enrolScope },
    select: { enroledAt: true },
    orderBy: { enroledAt: "asc" },
  });

  const monthlyMap: Record<string, number> = {};
  for (const e of recentEnrolments) {
    const key = `${e.enroledAt.getFullYear()}-${String(e.enroledAt.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[key] = (monthlyMap[key] ?? 0) + 1;
  }
  const monthlyEnrolments = Object.entries(monthlyMap).map(([month, count]) => ({ month, count }));

  return {
    stats: {
      totalUsers,
      newUsersLast30,
      totalEnrolments,
      activeEnrolments,
      completedEnrolments,
      totalAttempts,
      passedAttempts,
      passRate: totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0,
      totalCerts,
      activeCerts,
      expiredCerts,
      revokedCerts,
      suspendedCerts,
      pendingCPD,
    },
    schemeStats: schemeStats.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      certificates: s._count.certificates,
      examPapers: s._count.examPapers,
    })),
    monthlyEnrolments,
  };
}
