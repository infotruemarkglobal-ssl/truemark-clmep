import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return <>{children}</>;
}
