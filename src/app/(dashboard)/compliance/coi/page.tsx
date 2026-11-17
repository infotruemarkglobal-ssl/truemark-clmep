import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";
import { can } from "@/lib/permissions";
import COIDeclarationsPage from "@/components/compliance/COIDeclarationsPage";

export const metadata: Metadata = { title: "Conflict of Interest Declarations" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(STAFF_ROLES as string[]).includes(session.user.role)) redirect("/dashboard");

  const canReviewAll = await can(session, "compliance:read");

  return <COIDeclarationsPage canReviewAll={canReviewAll} currentUserId={session.user.id} />;
}
