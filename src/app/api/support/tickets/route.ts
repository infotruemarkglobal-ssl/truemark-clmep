import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";

const AGENT_ROLES: string[] = [USER_ROLES.SUPPORT_AGENT, USER_ROLES.SUPER_ADMIN];

async function generateTicketNumber(): Promise<string> {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `TKT-${yyyymm}-`;
  const count = await db.supportTicket.count({ where: { ticketNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, id: userId } = session.user;
  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status") ?? undefined;
  const priority = searchParams.get("priority") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const mine     = searchParams.get("mine") === "1";

  let where: Prisma.SupportTicketWhereInput = {};

  if (AGENT_ROLES.includes(role)) {
    if (mine) where = { assignedToId: userId };
    else {
      if (status)   where.status   = status;
      if (priority) where.priority = priority;
      if (category) where.category = category;
    }
  } else if (role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findFirst({
      where: { userId }, select: { organisationId: true },
    });
    if (!membership) return NextResponse.json({ tickets: [] });
    where = { organisationId: membership.organisationId };
  } else {
    // CANDIDATE — own tickets only
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

  return NextResponse.json({ tickets });
}

const createSchema = z.object({
  subject:        z.string().min(5, "Subject must be at least 5 characters").max(200),
  category:       z.enum(["BILLING", "TECHNICAL", "ACCOUNT", "EXAM", "CERTIFICATION", "GENERAL"]),
  priority:       z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  message:        z.string().min(10, "Please describe your issue in at least 10 characters"),
  organisationId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, id: userId } = session.user;

  // SUPPORT_AGENT cannot open tickets — they respond only
  if (AGENT_ROLES.includes(role)) {
    return NextResponse.json({ error: "Support agents respond to tickets; they cannot create them." }, { status: 403 });
  }

  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { subject, category, priority, message, organisationId: reqOrgId } = body.data;

  // ORG_MANAGER: derive orgId from their membership
  let organisationId: string | undefined;
  if (role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findFirst({
      where: { userId }, select: { organisationId: true },
    });
    organisationId = membership?.organisationId ?? undefined;
  } else if (reqOrgId) {
    organisationId = reqOrgId;
  }

  // Generate unique ticket number with retry on collision
  let ticketNumber: string;
  let ticket: Awaited<ReturnType<typeof db.supportTicket.create>> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    ticketNumber = await generateTicketNumber();
    try {
      ticket = await db.supportTicket.create({
        data: {
          ticketNumber,
          userId,
          organisationId: organisationId ?? undefined,
          subject,
          category,
          priority,
          status: "OPEN",
          messages: {
            create: {
              userId,
              content: message,
              isInternal: false,
            },
          },
        },
      });
      break;
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "P2002" && attempt < 2) continue; // unique collision — retry
      throw e;
    }
  }

  if (!ticket) return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });

  await auditLog({
    userId,
    action: "SUPPORT_TICKET_CREATED",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { ticketNumber: ticket.ticketNumber, subject, category },
  });

  // Notify support agents via Inngest
  await inngest.send({
    id: `ticket-created-${ticket.id}`,
    name: EVENTS.SEND_TICKET_CREATED,
    data: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, subject, category, priority, userId },
  }).catch((err) => console.error("[support] inngest ticket.created failed:", err));

  return NextResponse.json(ticket, { status: 201 });
}
