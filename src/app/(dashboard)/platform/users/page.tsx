import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import PlatformUsersClient from "@/components/platform/PlatformUsersClient";

export const metadata: Metadata = { title: "Manage Users — TrueMark Platform" };

async function getInternalUsers() {
  const users = await db.user.findMany({
    where: { role: { notIn: ["CANDIDATE", "ORG_MANAGER"] } },
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

  const [users, customRoles] = await Promise.all([
    getInternalUsers(),
    db.customRole.findMany({
      where: { isSystem: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    }),
  ]);

  return <PlatformUsersClient users={users} currentUserId={session.user.id} customRoles={customRoles} />;
}
