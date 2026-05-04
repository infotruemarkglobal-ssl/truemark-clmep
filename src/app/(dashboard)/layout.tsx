import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import AppShell from "@/components/layout/AppShell";
import NotificationCount from "@/components/layout/NotificationCount";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // The notification badge is a deferred slot — it streams in after the shell
  // renders. Suspense fallback is null (no badge = visually correct default).
  // This prevents the unreadCount DB query from blocking the initial HTML response.
  const notificationBadge = (
    <Suspense fallback={null}>
      <NotificationCount userId={session.user.id} />
    </Suspense>
  );

  return (
    <AppShell session={session} notificationBadge={notificationBadge}>
      {children}
    </AppShell>
  );
}
