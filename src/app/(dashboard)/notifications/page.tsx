import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import NotificationsPage from "@/components/notifications/NotificationsPage";

export const metadata: Metadata = { title: "Notifications" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const notifications = await db.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { sentAt: "desc" },
    take: 100,
  });

  const serialised = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    read: n.read,
    readAt: n.readAt?.toISOString() ?? null,
    sentAt: n.sentAt.toISOString(),
  }));

  return <NotificationsPage notifications={serialised} />;
}
