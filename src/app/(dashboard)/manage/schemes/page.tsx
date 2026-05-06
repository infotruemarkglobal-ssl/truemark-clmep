import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import SchemeManagementPage from "@/components/manage/SchemeManagementPage";

export const metadata: Metadata = { title: "Certification Schemes" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) redirect("/dashboard");

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
    },
  });

  return <SchemeManagementPage schemes={schemes} />;
}
