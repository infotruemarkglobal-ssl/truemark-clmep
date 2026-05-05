import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { USER_ROLES } from "@/lib/constants";
import NewOrgForm from "@/components/organisations/NewOrgForm";

export const metadata: Metadata = { title: "Create New Organisation" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) redirect("/dashboard");

  return <NewOrgForm />;
}
