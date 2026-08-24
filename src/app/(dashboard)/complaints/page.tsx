import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import MyComplaintsPage from "@/components/complaints/MyComplaintsPage";

export const metadata: Metadata = { title: "My Complaints" };

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Admins manage complaints via the dedicated /manage/complaints page.
  if ((ADMIN_ROLES as string[]).includes(session.user.role)) redirect("/manage/complaints");

  const complaints = await db.complaint.findMany({
    where: { userId: session.user.id },
    orderBy: { submittedAt: "desc" },
  });

  const serialised = complaints.map((c) => ({
    id: c.id,
    reference: c.reference,
    type: c.type,
    description: c.description,
    evidenceUrls: c.evidenceUrls,
    status: c.status,
    resolution: c.resolution,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    submittedAt: c.submittedAt.toISOString(),
  }));

  return <MyComplaintsPage complaints={serialised} />;
}
