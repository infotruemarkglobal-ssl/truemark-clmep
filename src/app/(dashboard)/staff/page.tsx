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
    // ORG_MANAGER: only see their org's members — no change to this path
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

  // SUPER_ADMIN: fetch all client-org memberships with user + org in one query.
  // Ordering by joinedAt asc means the first occurrence of a userId is their
  // earliest (primary) membership — used to deduplicate multi-org users.
  const allMemberships = await db.organisationMember.findMany({
    where: { organisation: { isPlatformOwner: false } },
    include: {
      user: {
        select: {
          id: true, firstName: true, lastName: true, email: true,
          role: true, status: true, mfaEnabled: true,
          lastLoginAt: true, createdAt: true, phone: true,
        },
      },
      organisation: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  // Keep only the first membership per user (primary org).
  const seen = new Set<string>();
  const deduped = allMemberships.filter((m) => {
    if (seen.has(m.userId)) return false;
    seen.add(m.userId);
    return true;
  });

  const serialised = deduped.map((m) => ({
    ...m.user,
    lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
    createdAt: m.user.createdAt.toISOString(),
    organisation: m.organisation,
  }));

  return (
    <StaffManagement
      initialUsers={serialised}
      total={deduped.length}
      isSuperAdmin={true}
      isOrgManager={false}
    />
  );
}
