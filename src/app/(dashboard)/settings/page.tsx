import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import SystemSettings from "@/components/settings/SystemSettings";

export const metadata: Metadata = { title: "System Settings" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session, "settings:manage"))) redirect("/dashboard");

  return <SystemSettings />;
}
