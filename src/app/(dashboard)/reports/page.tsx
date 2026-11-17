import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getReportsData } from "@/lib/reports";
import ReportsPage from "@/components/reports/ReportsPage";

export const metadata: Metadata = { title: "Reports & Analytics" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!(await can(session, "reports:read"))) redirect("/dashboard");

  const { stats, schemeStats, monthlyEnrolments } = await getReportsData(session);

  return (
    <ReportsPage stats={stats} schemeStats={schemeStats} monthlyEnrolments={monthlyEnrolments} />
  );
}
