import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import StaffManagement from "@/components/staff/StaffManagement";

export const metadata: Metadata = { title: "Staff Management" };

export default async function StaffPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const allowed = [USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_MANAGER] as string[];
  if (!allowed.includes(session.user.role)) redirect("/dashboard");

  const isOrgManager = session.user.role === USER_ROLES.ORG_MANAGER;

  if (isOrgManager) {
    // ORG_MANAGER: only see their org's members
    const membership = await db.organisationMember.findFirst({
      where: { userId: session.user.id },
      select: { organisationId: true },
    });
    if (!membership) redirect("/dashboard");

    const orgMembers = await db.organisationMember.findMany({
      where: { organisationId: membership.organisationId },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true,
            role: true, status: true, mfaEnabled: true,
            lastLoginAt: true, createdAt: true, phone: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const serialised = orgMembers.map((m) => ({
      ...m.user,
      lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
      createdAt: m.user.createdAt.toISOString(),
    }));

    return (
      <StaffManagement
        initialUsers={serialised}
        total={serialised.length}
        isSuperAdmin={false}
        isOrgManager={true}
      />
    );
  }

  // SUPER_ADMIN: show only members of client organisations (isPlatformOwner = false)
  const clientMemberIds = await db.organisationMember.findMany({
    where: { organisation: { isPlatformOwner: false } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const userIds = clientMemberIds.map((m) => m.userId);

  const [users, total] = await Promise.all([
    db.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        role: true, status: true, mfaEnabled: true,
        lastLoginAt: true, createdAt: true, phone: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.user.count({ where: { id: { in: userIds } } }),
  ]);

  const serialised = users.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <StaffManagement
      initialUsers={serialised}
      total={total}
      isSuperAdmin={session.user.role === USER_ROLES.SUPER_ADMIN}
      isOrgManager={false}
    />
  );
}
