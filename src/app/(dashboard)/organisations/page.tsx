import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import OrganisationsPage from "@/components/organisations/OrganisationsPage";

export const metadata: Metadata = { title: "Organisations" };

export default async function OrganisationsRoute() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const allowed = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.ORG_MANAGER] as string[];
  if (!allowed.includes(session.user.role)) redirect("/dashboard");

  // ORG_MANAGER goes straight to their organisation's detail page
  if (session.user.role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findFirst({
      where: { userId: session.user.id },
      select: { organisationId: true },
    });
    if (membership) redirect(`/organisations/${membership.organisationId}`);
    // No org assigned — redirect to dashboard, they can't manage an org they're not part of
    redirect("/dashboard");
  }

  const organisations = await db.organisation.findMany({
    include: { _count: { select: { members: true, purchases: true } } },
    orderBy: { createdAt: "desc" },
  });

  const serialised = organisations.map((o) => ({
    id: o.id,
    name: o.name,
    registrationNo: o.registrationNo,
    country: o.country,
    website: o.website,
    isActive: o.isActive,
    createdAt: o.createdAt.toISOString(),
    _count: o._count,
  }));

  return (
    <OrganisationsPage
      organisations={serialised}
      isSuperAdmin={session.user.role === USER_ROLES.SUPER_ADMIN}
    />
  );
}
