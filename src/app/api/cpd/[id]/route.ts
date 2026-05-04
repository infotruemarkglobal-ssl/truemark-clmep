import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  reviewNote: z.string().max(1000).optional().nullable(),
});

// GET /api/cpd/[id] — view a single CPD record
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);

  const record = await db.cPDRecord.findUnique({
    where: { id },
    include: { scheme: { select: { name: true, code: true } } },
  });

  if (!record) return NextResponse.json({ error: "CPD record not found" }, { status: 404 });
  if (!isAdmin && record.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(record);
}

// PATCH /api/cpd/[id] — admin: approve or reject a pending CPD record
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const record = await db.cPDRecord.findUnique({ where: { id } });
  if (!record) return NextResponse.json({ error: "CPD record not found" }, { status: 404 });

  const updated = await db.cPDRecord.update({
    where: { id },
    data: {
      status: body.data.status,
      reviewNote: body.data.reviewNote ?? null,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "CPD_RECORD_REVIEWED",
    entityType: "CPDRecord",
    entityId: id,
    metadata: { status: body.data.status, reviewNote: body.data.reviewNote ?? null, ownerId: record.userId },
  });

  return NextResponse.json(updated);
}

// DELETE /api/cpd/[id] — candidate: delete own pending record
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const record = await db.cPDRecord.findUnique({ where: { id } });
  if (!record) return NextResponse.json({ error: "CPD record not found" }, { status: 404 });

  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);
  if (!isAdmin && record.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only pending records can be deleted; approved records are part of the audit trail.
  if (!isAdmin && record.status !== "pending") {
    return NextResponse.json({ error: "Only pending CPD records can be deleted" }, { status: 409 });
  }

  await db.cPDRecord.delete({ where: { id } });

  await auditLog({
    userId: session.user.id,
    action: "CPD_RECORD_DELETED",
    entityType: "CPDRecord",
    entityId: id,
    metadata: { title: record.title, ownerId: record.userId },
  });

  return NextResponse.json({ deleted: true });
}
