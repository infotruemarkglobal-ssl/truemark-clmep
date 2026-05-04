import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { USER_ROLES } from "@/lib/constants";
import SystemSettings from "@/components/settings/SystemSettings";

export const metadata: Metadata = { title: "System Settings" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) redirect("/dashboard");

  return <SystemSettings />;
}
