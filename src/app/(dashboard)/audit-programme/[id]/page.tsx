import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import AuditProgrammeDetail from "@/components/audit/AuditProgrammeDetail";

export const metadata: Metadata = { title: "Audit Detail" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const allowed = [USER_ROLES.SUPER_ADMIN, USER_ROLES.AUDITOR];
  if (!(allowed as string[]).includes(session.user.role)) redirect("/dashboard");

  const audit = await db.internalAudit.findUnique({
    where: { id },
    include: {
      leadAuditor: { select: { id: true, firstName: true, lastName: true } },
      nonConformities: {
        orderBy: { createdAt: "desc" },
        include: {
          reportedByUser: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!audit) notFound();

  const auditors =
    session.user.role === USER_ROLES.SUPER_ADMIN
      ? await db.user.findMany({
          where: {
            role: { in: [USER_ROLES.AUDITOR, USER_ROLES.SUPER_ADMIN] },
            status: "ACTIVE",
          },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: "asc" },
        })
      : [];

  const serialised = {
    id: audit.id,
    reference: audit.reference,
    title: audit.title,
    scope: audit.scope,
    auditType: audit.auditType,
    status: audit.status,
    plannedDate: audit.plannedDate.toISOString(),
    completedAt: audit.completedAt?.toISOString() ?? null,
    leadAuditor: {
      id: audit.leadAuditor.id,
      firstName: audit.leadAuditor.firstName,
      lastName: audit.leadAuditor.lastName,
    },
    findings: audit.findings,
    nonConformities: audit.nonConformities.map((nc) => ({
      id: nc.id,
      reference: nc.reference,
      type: nc.type,
      description: nc.description,
      status: nc.status,
      reportedBy: nc.reportedByUser
        ? `${nc.reportedByUser.firstName} ${nc.reportedByUser.lastName}`
        : null,
      dueDate: nc.dueDate?.toISOString() ?? null,
    })),
  };

  return (
    <AuditProgrammeDetail
      audit={serialised}
      isSuperAdmin={session.user.role === USER_ROLES.SUPER_ADMIN}
      isLeadAuditor={audit.leadAuditorId === session.user.id}
      auditors={auditors}
    />
  );
}
