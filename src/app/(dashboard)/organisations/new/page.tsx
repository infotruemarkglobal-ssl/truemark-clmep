import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import NewOrgForm from "@/components/organisations/NewOrgForm";

export const metadata: Metadata = { title: "Create New Organisation" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session, "organisations:create"))) redirect("/dashboard");

  return <NewOrgForm />;
}
