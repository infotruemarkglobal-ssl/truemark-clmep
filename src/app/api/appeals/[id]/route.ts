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
    status: z.enum(["ACKNOWLEDGED", "UNDER_REVIEW", "UPHELD", "REJECTED", "ESCALATED", "CLOSED"]),
    resolution: z.string().min(5).optional(),
    assignedTo: z.string().optional().nullable(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    const msg = body.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const appeal = await db.appeal.findUnique({ where: { id } });
  if (!appeal) return NextResponse.json({ error: "Appeal not found" }, { status: 404 });

  // ISO 17024 Cl.6.2.4 — appeal decisions are final once issued.
  if (["UPHELD", "REJECTED", "CLOSED"].includes(appeal.status)) {
    return NextResponse.json(
      { error: "This appeal has already been finalised and cannot be modified" },
      { status: 409 },
    );
  }

  // Enforce the status transition graph — prevents jumping to states out of order
  // (e.g., going straight from SUBMITTED to CLOSED without review).
  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    SUBMITTED:    ["ACKNOWLEDGED", "UNDER_REVIEW", "UPHELD", "REJECTED", "CLOSED"],
    ACKNOWLEDGED: ["UNDER_REVIEW", "ESCALATED", "UPHELD", "REJECTED", "CLOSED"],
    UNDER_REVIEW: ["UPHELD", "REJECTED", "ESCALATED", "CLOSED"],
    ESCALATED:    ["UNDER_REVIEW", "UPHELD", "REJECTED", "CLOSED"],
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

  const resolved = ["UPHELD", "REJECTED", "CLOSED"].includes(body.data.status);

  try {
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

    // Notify the candidate on status changes they care about
    const CANDIDATE_VISIBLE = ["ACKNOWLEDGED", "UPHELD", "REJECTED", "CLOSED"];
    if (CANDIDATE_VISIBLE.includes(body.data.status)) {
      const statusMessages: Record<string, string> = {
        ACKNOWLEDGED: `Your appeal (${appeal.reference}) has been received and is now under review.`,
        UPHELD: `Your appeal (${appeal.reference}) has been upheld. ${body.data.resolution ? `Decision: ${body.data.resolution}` : ""}`,
        REJECTED: `Your appeal (${appeal.reference}) was not upheld. ${body.data.resolution ? `Reason: ${body.data.resolution}` : ""}`,
        CLOSED: `Your appeal (${appeal.reference}) has been closed.`,
      };
      await db.notification.create({
        data: {
          userId: appeal.userId,
          type: "APPEAL_UPDATE",
          title: `Appeal ${body.data.status.charAt(0) + body.data.status.slice(1).toLowerCase()} — ${appeal.reference}`,
          message: statusMessages[body.data.status] ?? `Your appeal status has been updated to ${body.data.status}.`,
          link: `/appeals`,
        },
      }).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[appeals PATCH]", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
