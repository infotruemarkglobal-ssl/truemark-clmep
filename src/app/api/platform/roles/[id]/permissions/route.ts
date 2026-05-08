import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

// PUT /api/platform/roles/[id]/permissions — toggle a single permission on/off
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: roleId } = await params;

  const schema = z.object({
    permissionId: z.string(),
    granted: z.boolean(),
  });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const role = await db.customRole.findUnique({ where: { id: roleId } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  const { permissionId, granted } = parsed.data;

  const permission = await db.permission.findUnique({ where: { id: permissionId } });
  if (!permission) return NextResponse.json({ error: "Permission not found" }, { status: 404 });

  // Capture before state for the before/after audit snapshot.
  const beforeRecord = await db.rolePermission.findUnique({
    where: { roleId_permissionId: { roleId, permissionId } },
  });
  const beforeGranted = beforeRecord !== null;

  if (granted) {
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      create: { roleId, permissionId },
      update: {},
    });
  } else {
    await db.rolePermission.deleteMany({ where: { roleId, permissionId } });
  }

  await auditLog({
    userId: session.user.id,
    action: "ROLE_PERMISSION_UPDATED",
    entityType: "CustomRole",
    entityId: roleId,
    metadata: {
      roleName: role.name,
      permissionId,
      resource: permission.resource,
      permissionAction: permission.action,
      before: { granted: beforeGranted },
      after: { granted },
      severity: "HIGH",
    },
  });

  return NextResponse.json({ roleId, permissionId, granted });
}

// DELETE /api/platform/roles/[id] — delete a custom (non-system) role
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const role = await db.customRole.findUnique({
    where: { id },
    include: { _count: { select: { userRoles: true } } },
  });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (role.isSystem) return NextResponse.json({ error: "System roles cannot be deleted" }, { status: 403 });
  if (role._count.userRoles > 0)
    return NextResponse.json(
      { error: `Cannot delete: ${role._count.userRoles} user${role._count.userRoles !== 1 ? "s are" : " is"} assigned to this role` },
      { status: 409 },
    );

  await db.customRole.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
