import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import SchemeManagementPage from "@/components/manage/SchemeManagementPage";

export const metadata: Metadata = { title: "Certification Schemes" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session, "schemes:read"))) redirect("/dashboard");

  const schemes = await db.certificationScheme.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isActive: true,
      validityMonths: true,
      passMark: true,
      maxAttempts: true,
      cpdHoursRequired: true,
      standardVersion: true,
      eligibilityEnabled: true,
      minAgeYears: true,
      minExperienceYears: true,
      requiredQualifications: true,
      requiredPriorCerts: true,
      requiresDocuments: true,
      requiresEmployerLetter: true,
      requiresIdDocument: true,
      eligibilityNotes: true,
      autoApproveMinutes: true,
      renewalRequiresExam: true,
      renewalRequiresCPD: true,
      renewalExamWindowMonths: true,
      approvalStatus: true,
      approvedBy: true,
      approvedAt: true,
    },
  });

  // approvedBy is a plain userId string (no FK relation) — batch-resolve
  // names rather than an N+1 per-scheme lookup.
  const approverIds = [...new Set(schemes.map((s) => s.approvedBy).filter((v): v is string => !!v))];
  const approvers = approverIds.length
    ? await db.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const approverById = new Map(approvers.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));

  const serialised = schemes.map((s) => ({
    ...s,
    approvedByName: s.approvedBy ? (approverById.get(s.approvedBy) ?? "Unknown") : null,
    approvedAt: s.approvedAt ? s.approvedAt.toISOString() : null,
  }));

  return <SchemeManagementPage schemes={serialised} canApprove={await can(session, "schemes:manage")} />;
}
