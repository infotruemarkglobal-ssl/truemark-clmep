import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { can } from "@/lib/permissions";

// Gated on permissions:manage (currently SUPER_ADMIN only), not users:read —
// users:read is granted broadly (most staff roles), and this layout wraps the
// entire /platform/* subtree (payments, permissions, org admin, etc.), not
// just the user-lookup page. A narrower per-page permission would be more
// accurate for /platform/users specifically, but this coarse layout gate
// must stay restrictive since it's the outer boundary for the whole subtree.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session, "permissions:manage"))) redirect("/dashboard");
  return <>{children}</>;
}
