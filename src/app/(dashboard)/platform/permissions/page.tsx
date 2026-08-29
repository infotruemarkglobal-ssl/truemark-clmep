import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import PermissionMatrix from "@/components/platform/PermissionMatrix";

export const metadata: Metadata = { title: "Permission Matrix — TrueMark Platform" };
// Permission data must always be fresh — never serve a cached snapshot.
export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Only SUPER_ADMIN (pure role, no matrix constraint) can manage permissions
  if (session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }
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
    baseRole: r.baseRole,
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
