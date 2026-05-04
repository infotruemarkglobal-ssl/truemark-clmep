import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import AuditLogPage from "@/components/audit/AuditLogPage";

export const metadata: Metadata = { title: "Audit Log" };

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.AUDITOR];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; userId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const { page = "1", action, userId } = await searchParams;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSize = 50;

  const where = {
    ...(action ? { action } : {}),
    ...(userId ? { userId } : {}),
  };

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
      orderBy: { timestamp: "desc" },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Distinct actions for filter dropdown
  const distinctActions = await db.auditLog.groupBy({ by: ["action"], orderBy: { _count: { action: "desc" } }, take: 30 });

  const serialised = logs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    metadata: log.metadata as string | null,
    ipAddress: log.ipAddress,
    timestamp: log.timestamp.toISOString(),
    user: log.user
      ? { id: log.user.id, firstName: log.user.firstName, lastName: log.user.lastName, email: log.user.email, role: log.user.role }
      : null,
  }));

  return (
    <AuditLogPage
      logs={serialised}
      total={total}
      page={pageNum}
      pageSize={pageSize}
      actions={distinctActions.map((a) => a.action)}
      currentAction={action}
      currentUserId={userId}
    />
  );
}
