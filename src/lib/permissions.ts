import { cache } from "react";
import { db } from "@/lib/db";
import type { Session } from "next-auth";

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

/**
 * Per-request cache of getUserPermissions.
 * React cache() scopes deduplication to a single request, so multiple can() calls
 * in the same route handler share one DB round-trip rather than N separate queries.
 */
export const getCachedUserPermissions = cache(getUserPermissions);

/**
 * Unified access check for API routes — the single function all route handlers should call.
 *
 * Pure role users (session.user.permissions === null):
 *   Falls back to allowedRoles list — existing behaviour, zero DB cost.
 *
 * Custom-role users (session.user.permissions is string[]):
 *   Reads permissions LIVE from DB so matrix changes take effect immediately,
 *   bypassing the stale JWT entirely. The per-request cache means this DB hit
 *   happens at most once per route invocation regardless of how many checks run.
 *
 * @param session      NextAuth session object (or null for unauthenticated requests)
 * @param permission   "resource:action" key from the permission catalogue
 * @param allowedRoles Built-in role values that may access this resource (pure-role fallback)
 */
export async function can(
  session: Session | null,
  permission: string,
  allowedRoles: string[] = [],
): Promise<boolean> {
  if (!session?.user) return false;
  const { id, role, permissions } = session.user;

  if (permissions === null) {
    // Pure built-in role user: role-based gate (no matrix applies)
    return (allowedRoles as string[]).includes(role);
  }

  // Custom-role user: live DB read so unchecking a permission takes effect immediately
  const livePerms = await getCachedUserPermissions(id);
  if (livePerms === null) {
    // Session says custom-role but DB disagrees — safe fallback
    return (allowedRoles as string[]).includes(role);
  }
  return livePerms.has(permission);
}
