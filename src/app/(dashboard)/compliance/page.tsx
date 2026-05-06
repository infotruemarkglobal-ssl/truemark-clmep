import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cacheQuery, CACHE_TAGS } from "@/lib/cache";
import { USER_ROLES } from "@/lib/constants";
import CompliancePage from "@/components/compliance/CompliancePage";

export const metadata: Metadata = { title: "ISO 17024 Compliance" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.AUDITOR];
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const [
    activeSchemes,
    activeExamPapers,
    totalCerts,
    openAppeals,
    recentAudits,
    totalCOI,
    coiUnderReview,
    openDSR,
    openNonConformities,
    overdueActions,
    expiringCerts,
  ] = await Promise.all([
    cacheQuery(() => db.certificationScheme.count({ where: { isActive: true } }), ["compliance-schemes"], [CACHE_TAGS.compliance], 300),
    cacheQuery(() => db.examPaper.count({ where: { isActive: true } }), ["compliance-exams"], [CACHE_TAGS.compliance, CACHE_TAGS.exam], 300),
    cacheQuery(() => db.certificate.count({ where: { status: "ACTIVE" } }), ["compliance-certs"], [CACHE_TAGS.compliance, CACHE_TAGS.certificate], 300),
    cacheQuery(() => db.appeal.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }), ["compliance-appeals"], [CACHE_TAGS.compliance], 300),
    db.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 10,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    }),
    cacheQuery(() => db.cOIDeclaration.count(), ["compliance-coi"], [CACHE_TAGS.compliance], 300),
    cacheQuery(() => db.cOIDeclaration.count({ where: { status: "UNDER_REVIEW" } }), ["compliance-coi-review"], [CACHE_TAGS.compliance], 300),
    cacheQuery(() => db.dataSubjectRequest.count({ where: { status: "pending" } }), ["compliance-dsr"], [CACHE_TAGS.compliance], 300),
    cacheQuery(() => db.nonConformity.count({ where: { status: "OPEN" } }), ["compliance-nc-open"], [CACHE_TAGS.compliance], 300),
    cacheQuery(() => db.correctiveAction.count({ where: { completedAt: null, dueDate: { lt: new Date() } } }), ["compliance-ca-overdue"], [CACHE_TAGS.compliance], 300),
    cacheQuery(() => db.certificate.count({ where: { status: "ACTIVE", expiresAt: { gt: new Date(), lt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) } } }), ["compliance-certs-expiring"], [CACHE_TAGS.compliance, CACHE_TAGS.certificate], 300),
  ]);

  const serialisedAudits = recentAudits.map((a) => ({
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    createdAt: a.timestamp.toISOString(),
    user: a.user ? { firstName: a.user.firstName, lastName: a.user.lastName, email: a.user.email } : null,
  }));

  return (
    <CompliancePage
      metrics={{
        activeSchemes,
        activeExamPapers,
        totalCerts,
        openAppeals,
        totalCOI,
        coiUnderReview,
        openDSR,
        openNonConformities,
        overdueActions,
        expiringCerts,
      }}
      recentAudits={serialisedAudits}
      checkedAt={new Date().toISOString()}
    />
  );
}
