import { db } from "@/lib/db";

/**
 * Check whether a user has a specific permission.
 *
 * Checks in order:
 *   1. The system CustomRole that mirrors the user's built-in role (user.role).
 *   2. Any additional custom roles assigned to the user via UserCustomRole.
 *
 * Returns true if any matched role grants the permission.
 */
export async function hasPermission(
  userId: string,
  resource: string,
  action: string,
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return false;

  const match = await db.rolePermission.findFirst({
    where: {
      permission: { resource, action },
      role: {
        OR: [
          { name: user.role, isSystem: true },
          { userRoles: { some: { userId } } },
        ],
      },
    },
  });

  return !!match;
}

/**
 * Return the full set of permissions for a user as a Set of "resource:action" strings.
 * Useful for bulk-checking multiple permissions in one DB round-trip.
 */
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return new Set();

  const rows = await db.rolePermission.findMany({
    where: {
      role: {
        OR: [
          { name: user.role, isSystem: true },
          { userRoles: { some: { userId } } },
        ],
      },
    },
    select: { permission: { select: { resource: true, action: true } } },
  });

  return new Set(rows.map((r) => `${r.permission.resource}:${r.permission.action}`));
}
