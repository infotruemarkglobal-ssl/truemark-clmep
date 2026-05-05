import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import PlatformUsersClient from "@/components/platform/PlatformUsersClient";

export const metadata: Metadata = { title: "Manage Users — TrueMark Platform" };

async function getInternalUsers() {
  const platformOrg = await db.organisation.findFirst({
    where: { isPlatformOwner: true },
    select: { id: true },
  });
  if (!platformOrg) return [];

  const members = await db.organisationMember.findMany({
    where: { organisationId: platformOrg.id },
    select: { userId: true },
    distinct: ["userId"],
  });
  const userIds = members.map((m) => m.userId);

  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      _count: { select: { enrolments: true } },
    },
  });

  return users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  }));
}

export default async function PlatformUsersPage() {
  // Defence-in-depth: layout gate restricts /platform/* to SUPER_ADMIN,
  // but verify here too so this page is safe if the layout changes.
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) redirect("/dashboard");

  const users = await getInternalUsers();

  return <PlatformUsersClient users={users} currentUserId={session.user.id} />;
}
