import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import PlatformUserDetail from "@/components/platform/PlatformUserDetail";

export const metadata: Metadata = { title: "User Detail — TrueMark Platform" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) redirect("/dashboard");

  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      status: true,
      mustChangePassword: true,
      mfaEnabled: true,
      failedLoginCount: true,
      lockedUntil: true,
      lastLoginAt: true,
      createdAt: true,
      organisationMemberships: {
        select: {
          id: true,
          role: true,
          joinedAt: true,
          organisation: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) notFound();

  const serialised = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    mfaEnabled: user.mfaEnabled,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    organisationMemberships: user.organisationMemberships.map((m) => ({
      id: m.id,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      organisation: m.organisation,
    })),
  };

  return <PlatformUserDetail user={serialised} isSelf={session.user.id === id} />;
}
