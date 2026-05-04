import type { Metadata } from "next";
import { db } from "@/lib/db";
import PermissionMatrix from "@/components/platform/PermissionMatrix";

export const metadata: Metadata = { title: "Permission Matrix — TrueMark Platform" };

export default async function PermissionsPage() {
  const [permissions, roles] = await Promise.all([
    db.permission.findMany({
      orderBy: [{ category: "asc" }, { resource: "asc" }, { action: "asc" }],
    }),
    db.customRole.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: {
        rolePermissions: { select: { permissionId: true } },
        _count: { select: { userRoles: true } },
      },
    }),
  ]);

  const serialisedRoles = roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissionIds: r.rolePermissions.map((rp) => rp.permissionId),
    userCount: r._count.userRoles,
  }));

  return (
    <PermissionMatrix
      initialPermissions={permissions}
      initialRoles={serialisedRoles}
    />
  );
}
