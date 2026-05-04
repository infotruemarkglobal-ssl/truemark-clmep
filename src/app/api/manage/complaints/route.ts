import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

// GET /api/manage/complaints — paginated list of all complaints (admin only)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: admin staff should not hammer this endpoint (e.g., polling loops in UI code).
  const rl = await rateLimit(session.user.id, "manage-complaints-list", { limit: 30, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const PAGE_SIZE = 25;

  const complaints = await db.complaint.findMany({
    where: { ...(status ? { status } : {}) },
    orderBy: { submittedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  const hasMore = complaints.length > PAGE_SIZE;
  const page = hasMore ? complaints.slice(0, PAGE_SIZE) : complaints;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({ complaints: page, nextCursor });
}

const patchSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "UNDER_REVIEW", "RESOLVED", "CLOSED"]),
  resolution: z.string().min(5).optional().nullable(),
  assignedTo: z.string().optional().nullable(),
});

// PATCH /api/manage/complaints — update a single complaint status
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = await rateLimit(session.user.id, "manage-complaints-patch", { limit: 20, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing complaint id" }, { status: 400 });

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const complaint = await db.complaint.findUnique({ where: { id } });
  if (!complaint) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });

  if (["RESOLVED", "CLOSED"].includes(complaint.status)) {
    return NextResponse.json(
      { error: "This complaint has already been finalised and cannot be modified" },
      { status: 409 },
    );
  }

  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    SUBMITTED:    ["ACKNOWLEDGED", "UNDER_REVIEW", "CLOSED"],
    ACKNOWLEDGED: ["UNDER_REVIEW", "CLOSED"],
    UNDER_REVIEW: ["RESOLVED", "CLOSED"],
  };
  const allowed = ALLOWED_TRANSITIONS[complaint.status] ?? [];
  if (!allowed.includes(body.data.status)) {
    return NextResponse.json(
      {
        error: `Invalid transition: ${complaint.status} → ${body.data.status}. Allowed: ${allowed.join(", ") || "none"}.`,
      },
      { status: 422 },
    );
  }

  const isFinal = ["RESOLVED", "CLOSED"].includes(body.data.status);

  const updated = await db.complaint.update({
    where: { id },
    data: {
      status: body.data.status,
      resolution: body.data.resolution ?? null,
      resolvedAt: isFinal ? new Date() : null,
      assignedTo: body.data.assignedTo !== undefined ? body.data.assignedTo : complaint.assignedTo,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "COMPLAINT_UPDATED",
    entityType: "Complaint",
    entityId: id,
    metadata: { status: body.data.status, resolution: body.data.resolution },
  });

  return NextResponse.json(updated);
}
