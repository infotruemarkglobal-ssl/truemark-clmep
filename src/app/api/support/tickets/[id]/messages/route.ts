import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { inngest, EVENTS } from "@/inngest/client";

const AGENT_ROLES: string[] = [USER_ROLES.SUPPORT_AGENT, USER_ROLES.SUPER_ADMIN];

const schema = z.object({
  content:    z.string().min(1, "Message cannot be empty").max(5000),
  isInternal: z.boolean().default(false),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: ticketId } = await params;
  const { role, id: userId } = session.user;
  const isAgent = AGENT_ROLES.includes(role);

  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Access: agent sees all; candidate sees own; ORG_MANAGER sees org or own
  if (!isAgent) {
    if (role === USER_ROLES.ORG_MANAGER) {
      const membership = await db.organisationMember.findFirst({
        where: { userId }, select: { organisationId: true },
      });
      const canAccess =
        ticket.userId === userId ||
        (ticket.organisationId && ticket.organisationId === membership?.organisationId);
      if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else if (ticket.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Non-agents cannot send internal messages
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const isInternal = isAgent ? body.data.isInternal : false;

  const [message] = await db.$transaction([
    db.ticketMessage.create({
      data: { ticketId, userId, content: body.data.content, isInternal },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    }),
    // Auto-advance status: OPEN → IN_PROGRESS when agent first replies
    ...(isAgent && ticket.status === "OPEN" && !isInternal
      ? [db.supportTicket.update({ where: { id: ticketId }, data: { status: "IN_PROGRESS" } })]
      : [db.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } })]),
  ]);

  // Email creator when agent sends a non-internal reply
  if (isAgent && !isInternal) {
    const creator = await db.user.findUnique({
      where: { id: ticket.userId }, select: { email: true, firstName: true },
    });
    if (creator) {
      await inngest.send({
        id: `ticket-reply-${message.id}`,
        name: EVENTS.SEND_TICKET_REPLY,
        data: {
          to: creator.email,
          firstName: creator.firstName,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          ticketId,
        },
      }).catch(() => {});
    }
  }

  return NextResponse.json(message, { status: 201 });
}
