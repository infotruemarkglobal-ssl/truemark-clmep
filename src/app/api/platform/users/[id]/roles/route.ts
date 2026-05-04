import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

// GET /api/platform/users/[id]/roles — get roles assigned to a user
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: userId } = await params;

  const assignments = await db.userCustomRole.findMany({
    where: { userId },
    include: { role: { select: { id: true, name: true, isSystem: true } } },
  });

  return NextResponse.json(assignments);
}

// POST /api/platform/users/[id]/roles — assign a custom role to a user
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: userId } = await params;

  const schema = z.object({ roleId: z.string() });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const role = await db.customRole.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  // Capture before state for the before/after audit snapshot.
  const existingAssignment = await db.userCustomRole.findUnique({
    where: { userId_roleId: { userId, roleId: parsed.data.roleId } },
  });

  const assignment = await db.userCustomRole.upsert({
    where: { userId_roleId: { userId, roleId: parsed.data.roleId } },
    create: { userId, roleId: parsed.data.roleId, assignedBy: session.user.id },
    update: {},
  });

  await auditLog({
    userId: session.user.id,
    action: "USER_ROLE_ASSIGNED",
    entityType: "User",
    entityId: userId,
    metadata: {
      roleId: parsed.data.roleId,
      roleName: role.name,
      targetEmail: user.email,
      before: { hasRole: existingAssignment !== null },
      after: { hasRole: true },
      severity: "HIGH",
    },
  });

  return NextResponse.json(assignment, { status: 201 });
}

// DELETE /api/platform/users/[id]/roles — remove a role from a user
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: userId } = await params;

  const schema = z.object({ roleId: z.string() });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Fetch role name before removing so it appears in the audit snapshot.
  const roleToRemove = await db.customRole.findUnique({
    where: { id: parsed.data.roleId },
    select: { name: true },
  });

  await db.userCustomRole.deleteMany({
    where: { userId, roleId: parsed.data.roleId },
  });

  await auditLog({
    userId: session.user.id,
    action: "USER_ROLE_REMOVED",
    entityType: "User",
    entityId: userId,
    metadata: {
      roleId: parsed.data.roleId,
      roleName: roleToRemove?.name ?? parsed.data.roleId,
      before: { hasRole: true },
      after: { hasRole: false },
      severity: "HIGH",
    },
  });

  return NextResponse.json({ removed: true });
}
