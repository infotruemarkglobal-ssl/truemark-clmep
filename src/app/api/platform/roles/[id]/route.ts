import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

function isSuperAdmin(role: string) {
  return role === "SUPER_ADMIN";
}

// GET /api/platform/roles/[id] — single role with permissions and user count
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const role = await db.customRole.findUnique({
    where: { id },
    include: {
      rolePermissions: { select: { permissionId: true } },
      _count: { select: { userRoles: true } },
    },
  });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  return NextResponse.json({
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissionIds: role.rolePermissions.map((rp) => rp.permissionId),
    userCount: role._count.userRoles,
  });
}

const patchSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(200).optional().nullable(),
  permissionIds: z.array(z.string()).optional(),
});

// PATCH /api/platform/roles/[id] — update name/description/permissions
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const role = await db.customRole.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  const { name, description, permissionIds } = parsed.data;

  // System roles: name and description are immutable
  if (role.isSystem && (name !== undefined || description !== undefined)) {
    return NextResponse.json(
      { error: "Cannot modify the name or description of a system role" },
      { status: 403 },
    );
  }

  // Build the atomic operation set
  const txOps: Prisma.PrismaPromise<unknown>[] = [];

  const roleData: { name?: string; description?: string | null } = {};
  if (name !== undefined) roleData.name = name;
  if (description !== undefined) roleData.description = description;
  if (Object.keys(roleData).length > 0) {
    txOps.push(db.customRole.update({ where: { id }, data: roleData }));
  }

  if (permissionIds !== undefined) {
    txOps.push(db.rolePermission.deleteMany({ where: { roleId: id } }));
    if (permissionIds.length > 0) {
      txOps.push(
        db.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        }),
      );
    }
  }

  if (txOps.length > 0) {
    await db.$transaction(txOps);
  }

  await auditLog({
    userId: session.user.id,
    action: "CUSTOM_ROLE_UPDATED",
    entityType: "CustomRole",
    entityId: id,
    metadata: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(permissionIds !== undefined && { permissionCount: permissionIds.length }),
      severity: "HIGH",
    },
  }).catch(() => {});

  const updated = await db.customRole.findUnique({
    where: { id },
    include: {
      rolePermissions: { select: { permissionId: true } },
      _count: { select: { userRoles: true } },
    },
  });

  return NextResponse.json({
    id: updated!.id,
    name: updated!.name,
    description: updated!.description,
    isSystem: updated!.isSystem,
    permissionIds: updated!.rolePermissions.map((rp) => rp.permissionId),
    userCount: updated!._count.userRoles,
  });
}

// DELETE /api/platform/roles/[id] — delete a custom role
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const role = await db.customRole.findUnique({
    where: { id },
    include: { _count: { select: { userRoles: true } } },
  });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  if (role.isSystem) {
    return NextResponse.json({ error: "Cannot delete a system role" }, { status: 403 });
  }

  if (role._count.userRoles > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete role — ${role._count.userRoles} user(s) are assigned to it. Reassign them first.`,
      },
      { status: 409 },
    );
  }

  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId: id } }),
    db.customRole.delete({ where: { id } }),
  ]);

  await auditLog({
    userId: session.user.id,
    action: "CUSTOM_ROLE_DELETED",
    entityType: "CustomRole",
    entityId: id,
    metadata: { name: role.name, severity: "HIGH" },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
