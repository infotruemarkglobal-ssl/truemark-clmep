import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";

const AGENT_ROLES: string[] = [USER_ROLES.SUPPORT_AGENT, USER_ROLES.SUPER_ADMIN];

async function resolveTicket(ticketId: string, userId: string, role: string) {
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return null;

  if (AGENT_ROLES.includes(role)) return ticket;

  if (role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findFirst({
      where: { userId }, select: { organisationId: true },
    });
    if (ticket.organisationId && ticket.organisationId === membership?.organisationId) return ticket;
    if (ticket.userId === userId) return ticket;
    return null;
  }

  // CANDIDATE — own only
  return ticket.userId === userId ? ticket : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { role, id: userId } = session.user;
  const isAgent = AGENT_ROLES.includes(role);

  const ticket = await resolveTicket(id, userId, role);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const full = await db.supportTicket.findUnique({
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

  return NextResponse.json(full);
}

const patchSchema = z.object({
  status:      z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority:    z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, id: userId } = session.user;
  if (!AGENT_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.supportTicket.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const updateData: Record<string, unknown> = { ...body.data };
  const now = new Date();
  if (body.data.status === "RESOLVED" && existing.status !== "RESOLVED") updateData.resolvedAt = now;
  if (body.data.status === "CLOSED"   && existing.status !== "CLOSED")   updateData.closedAt   = now;
  if (body.data.status === "OPEN"     && existing.status === "CLOSED")   updateData.closedAt   = null;

  const updated = await db.supportTicket.update({ where: { id }, data: updateData });

  await auditLog({
    userId,
    action: "SUPPORT_TICKET_UPDATED",
    entityType: "SupportTicket",
    entityId: id,
    metadata: { changes: body.data },
  });

  // Email ticket creator on RESOLVED
  if (body.data.status === "RESOLVED" && existing.status !== "RESOLVED") {
    const creator = await db.user.findUnique({
      where: { id: existing.userId }, select: { email: true, firstName: true },
    });
    if (creator) {
      await inngest.send({
        id: `ticket-resolved-${id}-${Date.now()}`,
        name: EVENTS.SEND_TICKET_RESOLVED,
        data: {
          to: creator.email,
          firstName: creator.firstName,
          ticketNumber: existing.ticketNumber,
          subject: existing.subject,
          ticketId: id,
        },
      }).catch(() => {});
    }
  }

  return NextResponse.json(updated);
}
