import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import AppShell from "@/components/layout/AppShell";
import NotificationCount from "@/components/layout/NotificationCount";
import CartCount from "@/components/layout/CartCount";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const notificationBadge = (
    <Suspense fallback={null}>
      <NotificationCount userId={session.user.id} />
    </Suspense>
  );

  const cartBadge = (
    <Suspense fallback={null}>
      <CartCount userId={session.user.id} />
    </Suspense>
  );

  return (
    <AppShell session={session} notificationBadge={notificationBadge} cartBadge={cartBadge}>
      {children}
    </AppShell>
  );
}
