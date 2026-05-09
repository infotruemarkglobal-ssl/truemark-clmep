import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import AuditProgrammeList from "@/components/audit/AuditProgrammeList";

export const metadata: Metadata = { title: "Audit Programme" };

const ALLOWED_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const allowed = [USER_ROLES.SUPER_ADMIN, USER_ROLES.AUDITOR];
  if (!(allowed as string[]).includes(session.user.role)) redirect("/dashboard");

  const { status } = await searchParams;
  const statusFilter = ALLOWED_STATUSES.includes(status ?? "") ? status : undefined;

  const [audits, auditors] = await Promise.all([
    db.internalAudit.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { plannedDate: "asc" },
      include: {
        leadAuditor: { select: { id: true, firstName: true, lastName: true } },
        nonConformities: { select: { id: true } },
      },
    }),
    session.user.role === USER_ROLES.SUPER_ADMIN
      ? db.user.findMany({
          where: { role: { notIn: ["CANDIDATE", "ORG_MANAGER"] }, status: "ACTIVE" },
          select: { id: true, firstName: true, lastName: true, role: true },
          orderBy: { firstName: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const serialised = audits.map((a) => ({
    id: a.id,
    reference: a.reference,
    title: a.title,
    scope: a.scope,
    auditType: a.auditType,
    status: a.status,
    plannedDate: a.plannedDate.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
    leadAuditor: {
      id: a.leadAuditor.id,
      firstName: a.leadAuditor.firstName,
      lastName: a.leadAuditor.lastName,
    },
    nonConformityCount: a.nonConformities.length,
  }));

  return (
    <AuditProgrammeList
      audits={serialised}
      auditors={auditors}
      isSuperAdmin={session.user.role === USER_ROLES.SUPER_ADMIN}
      currentStatus={statusFilter ?? null}
    />
  );
}
