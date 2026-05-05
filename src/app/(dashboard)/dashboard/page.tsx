import { Suspense } from "react";
import type { Metadata } from "next";
import { getCachedSession as auth } from "@/lib/auth";
import CandidateDashboard from "@/components/dashboard/CandidateDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import OrgDashboard from "@/components/dashboard/OrgDashboard";
import SupportAgentDashboard from "@/components/dashboard/SupportAgentDashboard";
import DashboardLoading from "../loading";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  const role = session!.user.role;

  // Wrap the data-fetching dashboard component in Suspense so the AppShell
  // (nav + sidebar) renders and the skeleton shows while DB queries run.
  let dashboard: React.ReactNode;
  if (role === "ORG_MANAGER") {
    dashboard = <OrgDashboard />;
  } else if (
    ["SUPER_ADMIN", "CERTIFICATION_OFFICER", "EXAMINER", "TRAINER", "PROCTOR", "AUDITOR"].includes(role)
  ) {
    dashboard = <AdminDashboard role={role as import("@/lib/constants").UserRole} />;
  } else if (role === "SUPPORT_AGENT") {
    dashboard = <SupportAgentDashboard />;
  } else {
    dashboard = <CandidateDashboard />;
  }

  return <Suspense fallback={<DashboardLoading />}>{dashboard}</Suspense>;
}
