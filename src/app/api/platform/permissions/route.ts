import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "@/lib/permission-definitions";

// GET /api/platform/permissions — list all permissions grouped by category
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const permissions = await db.permission.findMany({
    orderBy: [{ category: "asc" }, { resource: "asc" }, { action: "asc" }],
  });

  return NextResponse.json(permissions);
}

/**
 * POST /api/platform/permissions — sync permissions + system-role defaults to the DB.
 * Safe to call multiple times (upserts); never deletes existing role_permission grants.
 * Call this once after deploying to production if the seed script was never run.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Only pure SUPER_ADMIN can run a sync (custom-role users cannot bootstrap their own permissions)
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Upsert all permission definitions
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { resource_action: { resource: p.resource, action: p.action } },
      update: { label: p.label, description: p.description, category: p.category },
      create: { resource: p.resource, action: p.action, label: p.label, description: p.description ?? "", category: p.category },
    });
  }

  // Upsert system custom roles and seed their default permissions
  const systemRoleNames = Object.keys(SYSTEM_ROLE_PERMISSIONS);
  let rolesCreated = 0;
  let permissionsAssigned = 0;

  for (const roleName of systemRoleNames) {
    const role = await db.customRole.upsert({
      where: { name: roleName },
      update: { isSystem: true },
      create: { name: roleName, isSystem: true, baseRole: roleName },
    });

    const pairs = SYSTEM_ROLE_PERMISSIONS[roleName];
    const permRecords = await db.permission.findMany({
      where: { OR: pairs.map(([resource, action]) => ({ resource, action })) },
    });

    for (const perm of permRecords) {
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
      permissionsAssigned++;
    }
    rolesCreated++;
  }

  return NextResponse.json({
    ok: true,
    permissionsUpserted: PERMISSIONS.length,
    systemRolesUpserted: rolesCreated,
    permissionsAssigned,
  });
}
