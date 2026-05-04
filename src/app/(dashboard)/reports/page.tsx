import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import ReportsPage from "@/components/reports/ReportsPage";

export const metadata: Metadata = { title: "Reports & Analytics" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.AUDITOR, USER_ROLES.ORG_MANAGER];
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // HIGH-4 RBAC fix: ORG_MANAGER only sees data for their own organisation's members
  let orgUserIds: string[] | null = null;
  if (session.user.role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findFirst({
      where: { userId: session.user.id },
      select: { organisationId: true },
    });
    if (membership) {
      const members = await db.organisationMember.findMany({
        where: { organisationId: membership.organisationId },
        select: { userId: true },
      });
      orgUserIds = members.map((m) => m.userId);
    } else {
      orgUserIds = [];
    }
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

  // Monthly enrolments for last 6 months
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const recentEnrolments = await db.enrolment.findMany({
    where: { enroledAt: { gte: sixMonthsAgo }, ...enrolScope },
    select: { enroledAt: true },
    orderBy: { enroledAt: "asc" },
  });

  // Group by month
  const monthlyMap: Record<string, number> = {};
  for (const e of recentEnrolments) {
    const key = `${e.enroledAt.getFullYear()}-${String(e.enroledAt.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[key] = (monthlyMap[key] ?? 0) + 1;
  }
  const monthlyEnrolments = Object.entries(monthlyMap).map(([month, count]) => ({ month, count }));

  return (
    <ReportsPage
      stats={{
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
      }}
      schemeStats={schemeStats.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        certificates: s._count.certificates,
        examPapers: s._count.examPapers,
      }))}
      monthlyEnrolments={monthlyEnrolments}
    />
  );
}
