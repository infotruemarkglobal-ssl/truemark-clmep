import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { format, subMonths, startOfDay, endOfDay } from "date-fns";
import ManagementReviewPage, { type ReportData } from "@/components/manage/ManagementReviewPage";

export const metadata: Metadata = { title: "Management Review" };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; generate?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) redirect("/dashboard");

  const params = await searchParams;
  const defaultFrom = format(subMonths(new Date(), 12), "yyyy-MM-dd");
  const defaultTo = format(new Date(), "yyyy-MM-dd");

  if (params.generate !== "1") {
    return (
      <ManagementReviewPage
        defaultFrom={defaultFrom}
        defaultTo={defaultTo}
        reportData={null}
      />
    );
  }

  const from = params.from ? startOfDay(new Date(params.from)) : subMonths(new Date(), 12);
  const to = params.to ? endOfDay(new Date(params.to)) : new Date();

  const [
    certsIssued, certsRevoked, activeCerts, examAttempts, passedAttempts,
    appealsReceived, appealsResolved, appealsPending, resolvedAppealsTiming,
    complaintsReceived, complaintsResolved,
    openNonConformities, overdueActions, expiringCerts,
    auditsCompleted, auditFindings,
  ] = await Promise.all([
    db.certificate.count({ where: { issuedAt: { gte: from, lte: to } } }),
    db.auditLog.count({ where: { action: "CERTIFICATE_REVOKED", timestamp: { gte: from, lte: to } } }),
    db.certificate.count({ where: { status: "ACTIVE" } }),
    db.examAttempt.count({ where: { createdAt: { gte: from, lte: to }, status: "COMPLETED" } }),
    db.examAttempt.count({ where: { createdAt: { gte: from, lte: to }, status: "COMPLETED", passed: true } }),
    db.appeal.count({ where: { submittedAt: { gte: from, lte: to } } }),
    db.appeal.count({ where: { status: "RESOLVED", resolvedAt: { gte: from, lte: to } } }),
    db.appeal.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "ACKNOWLEDGED"] } } }),
    db.appeal.findMany({
      where: { status: "RESOLVED", resolvedAt: { gte: from, lte: to } },
      select: { submittedAt: true, resolvedAt: true },
    }),
    db.complaint.count({ where: { submittedAt: { gte: from, lte: to } } }),
    db.complaint.count({ where: { status: "RESOLVED", resolvedAt: { gte: from, lte: to } } }),
    db.nonConformity.count({ where: { status: "OPEN" } }),
    db.correctiveAction.count({ where: { completedAt: null, dueDate: { lt: new Date() } } }),
    db.certificate.count({ where: { status: "ACTIVE", expiresAt: { gt: new Date(), lt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) } } }),
    db.internalAudit.count({ where: { status: "COMPLETED", completedAt: { gte: from, lte: to } } }),
    db.internalAudit.findMany({
      where: { status: "COMPLETED", completedAt: { gte: from, lte: to } },
      select: { reference: true, title: true, findings: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: 10,
    }),
  ]);

  const passRate = examAttempts > 0 ? Math.round((passedAttempts / examAttempts) * 100) : null;

  const avgResolutionDays = resolvedAppealsTiming.length > 0
    ? Math.round(
        (resolvedAppealsTiming.reduce(
          (sum, a) => sum + (a.resolvedAt!.getTime() - a.submittedAt.getTime()) / (1000 * 60 * 60 * 24),
          0,
        ) / resolvedAppealsTiming.length) * 10,
      ) / 10
    : null;

  const slaBreaches = resolvedAppealsTiming.filter(
    (a) => a.resolvedAt && a.resolvedAt.getTime() - a.submittedAt.getTime() > 28 * 24 * 60 * 60 * 1000,
  ).length;

  const recommendations: string[] = [];
  if (certsIssued > 0 && appealsReceived > certsIssued * 0.1) {
    recommendations.push(
      `Appeal rate is ${Math.round((appealsReceived / certsIssued) * 100)}% of certificates issued (${appealsReceived} appeals, ${certsIssued} certificates). Review assessment and examination processes for consistency and fairness.`,
    );
  }
  if (overdueActions > 0) {
    recommendations.push(
      `${overdueActions} corrective action${overdueActions > 1 ? "s are" : " is"} overdue. Immediate management attention is required to close nonconformities within agreed timescales.`,
    );
  }
  if (expiringCerts > 10) {
    recommendations.push(
      `${expiringCerts} certificates expire within 90 days. Proactively contact holders to initiate the renewal process and prevent certificate lapse.`,
    );
  }
  if (slaBreaches > 0) {
    recommendations.push(
      `${slaBreaches} appeal${slaBreaches > 1 ? "s" : ""} exceeded the 28-day resolution SLA (ISO 17024 Cl.7.9). Review appeals handling capacity and prioritisation.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "No significant issues identified in this review period. Maintain current operational standards and continue monitoring all compliance indicators.",
    );
  }

  const reportData: ReportData = {
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: new Date().toISOString(),
    sections: {
      certActivity: { certsIssued, certsRevoked, activeCerts, examAttempts, passedAttempts, passRate },
      appealsComplaints: {
        appealsReceived, appealsResolved, appealsPending,
        avgResolutionDays,
        slaBreaches,
        complaintsReceived, complaintsResolved,
      },
      complianceStatus: { openNonConformities, overdueActions, expiringCerts },
      auditProgramme: {
        auditsCompleted,
        findings: auditFindings.map((f) => ({
          reference: f.reference,
          title: f.title,
          findings: f.findings,
          completedAt: f.completedAt!.toISOString(),
        })),
      },
      recommendations,
    },
  };

  return (
    <ManagementReviewPage
      defaultFrom={params.from ?? defaultFrom}
      defaultTo={params.to ?? defaultTo}
      reportData={reportData}
    />
  );
}
