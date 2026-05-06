import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const schema = z.object({
    status: z.enum(["ACKNOWLEDGED", "UNDER_REVIEW", "RESOLVED", "ESCALATED", "CLOSED"]),
    resolution: z.string().min(5).optional(),
    assignedTo: z.string().optional().nullable(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const appeal = await db.appeal.findUnique({ where: { id } });
  if (!appeal) return NextResponse.json({ error: "Appeal not found" }, { status: 404 });

  // ISO 17024 Cl.6.2.4 — appeal decisions are final once issued.
  if (["RESOLVED", "CLOSED"].includes(appeal.status)) {
    return NextResponse.json(
      { error: "This appeal has already been finalised and cannot be modified" },
      { status: 409 },
    );
  }

  // Enforce the status transition graph — prevents jumping to states out of order
  // (e.g., going straight from SUBMITTED to CLOSED without review).
  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    SUBMITTED:    ["ACKNOWLEDGED", "UNDER_REVIEW", "CLOSED"],
    ACKNOWLEDGED: ["UNDER_REVIEW", "ESCALATED", "CLOSED"],
    UNDER_REVIEW: ["RESOLVED", "ESCALATED", "CLOSED"],
    ESCALATED:    ["UNDER_REVIEW", "RESOLVED", "CLOSED"],
  };
  const allowed = ALLOWED_TRANSITIONS[appeal.status] ?? [];
  if (!allowed.includes(body.data.status)) {
    return NextResponse.json(
      {
        error: `Invalid transition: ${appeal.status} → ${body.data.status}. Allowed next states: ${allowed.join(", ") || "none"}.`,
      },
      { status: 422 },
    );
  }

  const resolved = ["RESOLVED", "CLOSED"].includes(body.data.status);

  const updated = await db.appeal.update({
    where: { id },
    data: {
      status: body.data.status,
      resolution: body.data.resolution ?? null,
      resolvedAt: resolved ? new Date() : null,
      assignedTo: body.data.assignedTo !== undefined ? body.data.assignedTo : appeal.assignedTo,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "APPEAL_STATUS_UPDATED",
    entityType: "Appeal",
    entityId: id,
    metadata: {
      previousStatus: appeal.status,
      newStatus: body.data.status,
      resolution: body.data.resolution ?? null,
    },
  });

  return NextResponse.json(updated);
}
