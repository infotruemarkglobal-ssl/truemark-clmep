import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { getPermissionOrgScope } from "@/lib/permissions";
import TicketListPage from "@/components/support/TicketListPage";

export const metadata: Metadata = { title: "Support Tickets" };

const AGENT_ROLES: string[] = [USER_ROLES.SUPPORT_AGENT, USER_ROLES.SUPER_ADMIN];

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { role, id: userId } = session.user;
  const isAgent = AGENT_ROLES.includes(role);

  let where: Prisma.SupportTicketWhereInput = {};

  // Same pattern as GET /api/support/tickets — ORG_MANAGER's org-scoped view
  // here is pure role-identity, not gated by a formal tickets:read grant;
  // getPermissionOrgScope generalises it to also cover a custom role
  // explicitly scoped to one org, without changing what ORG_MANAGER sees.
  const ticketOrgIds = await getPermissionOrgScope(session, "tickets:read");
  const orgScoped = role === USER_ROLES.ORG_MANAGER || (ticketOrgIds !== null && ticketOrgIds.length > 0);

  if (isAgent) {
    // agents see all tickets
  } else if (orgScoped) {
    let orgIds = ticketOrgIds ?? [];
    if (role === USER_ROLES.ORG_MANAGER) {
      const membership = await db.organisationMember.findFirst({
        where: { userId },
        select: { organisationId: true },
      });
      if (membership) orgIds = [...new Set([...orgIds, membership.organisationId])];
    }
    where = orgIds.length > 0 ? { organisationId: { in: orgIds } } : { userId };
  } else {
    where = { userId };
  }

  const tickets = await db.supportTicket.findMany({
    where,
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      organisation: { select: { name: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const serialised = tickets.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    user: t.user,
    organisation: t.organisation,
    assignedTo: t.assignedTo,
    _count: t._count,
  }));

  return <TicketListPage initialTickets={serialised} userRole={role} />;
}
