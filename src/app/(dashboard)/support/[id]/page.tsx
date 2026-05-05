import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import TicketDetailPage from "@/components/support/TicketDetailPage";

export const metadata: Metadata = { title: "Ticket" };

const AGENT_ROLES: string[] = [USER_ROLES.SUPPORT_AGENT, USER_ROLES.SUPER_ADMIN];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const { role, id: userId } = session.user;
  const isAgent = AGENT_ROLES.includes(role);

  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      organisation: { select: { id: true, name: true } },
      messages: {
        where: isAgent ? undefined : { isInternal: false },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!ticket) notFound();

  // Access control for non-agents
  if (!isAgent) {
    if (role === USER_ROLES.ORG_MANAGER) {
      const membership = await db.organisationMember.findFirst({
        where: { userId },
        select: { organisationId: true },
      });
      const canAccess =
        ticket.userId === userId ||
        (ticket.organisationId !== null &&
          ticket.organisationId === membership?.organisationId);
      if (!canAccess) notFound();
    } else if (ticket.userId !== userId) {
      notFound();
    }
  }

  const serialised = {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    user: ticket.user,
    organisation: ticket.organisation,
    assignedTo: ticket.assignedTo,
    messages: ticket.messages.map((m) => ({
      id: m.id,
      userId: m.userId,
      content: m.content,
      isInternal: m.isInternal,
      createdAt: m.createdAt.toISOString(),
      user: m.user,
    })),
  };

  return (
    <TicketDetailPage
      initialTicket={serialised}
      currentUserId={userId}
      currentUserRole={role}
    />
  );
}
