import { db } from "@/lib/db";

/**
 * Permissions for pure built-in role users are implied by their role (the existing
 * role-based guards handle access).  Permissions stored in `role_permissions` only
 * materialise as enforceable constraints for users who have been explicitly assigned
 * a custom role via `user_custom_roles`.
 *
 * Returns:
 *   null  – user has no custom role; caller should fall back to role-based checks.
 *   Set   – user has ≥1 custom role; the set is the union of all granted permissions.
 *           An empty set means "custom role assigned but no permissions checked yet."
 */
export async function getUserPermissions(userId: string): Promise<Set<string> | null> {
  const customRoles = await db.userCustomRole.findMany({
    where: { userId },
    select: { roleId: true },
  });

  if (customRoles.length === 0) return null;

  const roleIds = customRoles.map((cr) => cr.roleId);
  const rows = await db.rolePermission.findMany({
    where: { roleId: { in: roleIds } },
    select: { permission: { select: { resource: true, action: true } } },
  });

  return new Set(rows.map((r) => `${r.permission.resource}:${r.permission.action}`));
}

/**
 * Check a single permission for a user.
 *
 * For custom-role users: returns true only if one of their custom roles grants it.
 * For pure role users (null): always returns true (caller must gate by role instead).
 */
export async function hasPermission(
  userId: string,
  resource: string,
  action: string,
): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  if (perms === null) return true; // pure role user — let role-based guards decide
  return perms.has(`${resource}:${action}`);
}

/**
 * Serialise permissions to a plain string array suitable for storing in a JWT.
 * Returns null for pure role users so the caller knows no matrix applies.
 */
export async function serializePermissions(userId: string): Promise<string[] | null> {
  const perms = await getUserPermissions(userId);
  if (perms === null) return null;
  return Array.from(perms);
}
