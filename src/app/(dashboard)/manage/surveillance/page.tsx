import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import SurveillanceReviewsPage from "@/components/manage/SurveillanceReviewsPage";

export const metadata: Metadata = { title: "Surveillance Reviews" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session, "surveillance:read"))) redirect("/dashboard");

  return <SurveillanceReviewsPage canManage={await can(session, "surveillance:manage")} />;
}
