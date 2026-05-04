// Async server component — fetches the unread notification count independently.
// Rendered inside a <Suspense> in DashboardLayout so the AppShell shell appears
// immediately and the badge streams in once the DB query completes.
// This avoids blocking the entire layout render on a notification COUNT query.

import { db } from "@/lib/db";

export default async function NotificationCount({ userId }: { userId: string }) {
  const count = await db.notification.count({
    where: { userId, read: false },
  });

  if (count === 0) return null;

  return (
    <span className="absolute top-1 right-1 min-w-[1.1rem] h-[1.1rem] bg-red-500 rounded-full ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-white leading-none px-0.5">
      {count > 99 ? "99+" : count}
    </span>
  );
}
