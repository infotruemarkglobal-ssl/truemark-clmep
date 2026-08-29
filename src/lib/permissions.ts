import { cache } from "react";
import { db } from "@/lib/db";
import type { Session } from "next-auth";

/**
 * Every user's effective permission set is resolved live from the database, every
 * call — there is no "pure built-in role, no matrix applies" bypass. The set is the
 * union of:
 *   1. Permissions granted to any custom role the user has been explicitly assigned
 *      (`user_custom_roles`), and
 *   2. Permissions granted to the `isSystem` role matching the user's plain
 *      `User.role` value (seeded by SYSTEM_ROLE_PERMISSIONS, live-editable via the
 *      Permission Matrix UI) — so a built-in role's permissions are exactly as
 *      DB-driven as a custom role's, and revoking one takes effect on the very next
 *      request, not on the next deploy.
 *
 * A user whose role can't be resolved to any grant (orphaned role, DB error) gets an
 * empty set — fail closed, never fall back to trusting the caller's role list alone.
 */
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return new Set();

  const [explicit, systemRole] = await Promise.all([
    db.userCustomRole.findMany({ where: { userId }, select: { roleId: true } }),
    db.customRole.findFirst({ where: { name: user.role, isSystem: true }, select: { id: true } }),
  ]);

  const roleIds = [...explicit.map((cr) => cr.roleId), ...(systemRole ? [systemRole.id] : [])];
  if (roleIds.length === 0) return new Set();

  const rows = await db.rolePermission.findMany({
    where: { roleId: { in: roleIds } },
    select: { permission: { select: { resource: true, action: true } } },
  });

  return new Set(rows.map((r) => `${r.permission.resource}:${r.permission.action}`));
}

/** Check a single permission for a user, resolved live per the rules above. */
export async function hasPermission(
  userId: string,
  resource: string,
  action: string,
): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return perms.has(`${resource}:${action}`);
}

/** Serialise permissions to a plain string array suitable for storing in a JWT. */
export async function serializePermissions(userId: string): Promise<string[]> {
  const perms = await getUserPermissions(userId);
  return Array.from(perms);
}

/**
 * Per-request cache of getUserPermissions.
 * React cache() scopes deduplication to a single request, so multiple can() calls
 * in the same route handler share one DB round-trip rather than N separate queries.
 */
export const getCachedUserPermissions = cache(getUserPermissions);

/**
 * Resolves the set of organisations a permission is scoped to for this user,
 * or `null` if it's held unrestricted (platform-wide).
 *
 * A permission counts as unrestricted if it's granted via a system role
 * (other than ORG_MANAGER — see below) matching `User.role`, or via a
 * `UserCustomRole` row with `organisationId: null`. Otherwise, it's the
 * deduped union of org ids from (a) org-scoped `UserCustomRole` rows
 * granting this permission, and (b) the legacy ORG_MANAGER path — their
 * single `OrganisationMember.organisationId`.
 *
 * ORG_MANAGER is a deliberate special case, not an oversight: its system
 * role grants several permissions (reports:read, users:read, ...) as plain
 * RolePermission rows, which carry no scope concept at all — every built-in
 * role's grants are structurally "platform-wide" at that layer. ORG_MANAGER
 * has never actually meant "see everything platform-wide" though; every
 * route that used it for scoping treated it as inherently own-org-only, a
 * business rule that has always lived in each route's own code, not in the
 * permission table. So a system-role grant only counts as unrestricted here
 * when the role isn't ORG_MANAGER — for ORG_MANAGER, holding a permission via
 * the system role means "scoped to their org", exactly like today, not
 * "platform-wide" merely because the RolePermission row itself carries no
 * scope. (A future built-in role with the same structural restriction would
 * need the same explicit carve-out — this isn't inferable from the schema.)
 *
 * Drop-in replacement for the `orgUserIds: string[] | null` pattern several
 * routes already hand-rolled by checking `role === "ORG_MANAGER"` directly:
 * `null` behaves identically to today's unfiltered scope, a populated array
 * replaces the manual `OrganisationMember` lookup — and, unlike the role
 * check it replaces, this also covers a custom role holder scoped to an org.
 */
export async function getPermissionOrgScope(
  session: Session | null,
  permission: string,
): Promise<string[] | null> {
  if (!session?.user) return [];
  const { id: userId, role } = session.user;

  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return [];

  const [resource, action] = permission.split(":");
  const permWhere = { permission: { resource, action } };

  const [platformWideGrants, scopedGrants, systemRolePerm] = await Promise.all([
    db.userCustomRole.findMany({
      where: { userId, organisationId: null },
      select: { role: { select: { rolePermissions: { where: permWhere, select: { permissionId: true } } } } },
    }),
    db.userCustomRole.findMany({
      where: { userId, organisationId: { not: null } },
      select: { organisationId: true, role: { select: { rolePermissions: { where: permWhere, select: { permissionId: true } } } } },
    }),
    db.customRole.findFirst({
      where: { name: user.role, isSystem: true },
      select: { rolePermissions: { where: permWhere, select: { permissionId: true } } },
    }),
  ]);

  const systemRoleGrants = (systemRolePerm?.rolePermissions.length ?? 0) > 0;
  const platformWide =
    (systemRoleGrants && role !== "ORG_MANAGER") ||
    platformWideGrants.some((g) => g.role.rolePermissions.length > 0);
  if (platformWide) return null;

  const orgIds = new Set<string>();
  for (const grant of scopedGrants) {
    if (grant.organisationId && grant.role.rolePermissions.length > 0) orgIds.add(grant.organisationId);
  }

  if (role === "ORG_MANAGER" && systemRoleGrants) {
    const membership = await db.organisationMember.findFirst({ where: { userId }, select: { organisationId: true } });
    if (membership) orgIds.add(membership.organisationId);
  }

  return Array.from(orgIds);
}

/**
 * Unified access check for API routes — the single function all route handlers should call.
 *
 * The live permission matrix is always the deciding factor. `allowedRoles`, when given,
 * is an additional upper bound — the user's `session.user.role` must also be in that
 * list — not a fallback used only when there's no matrix. This means: revoking a
 * permission from a role denies access immediately regardless of allowedRoles, while
 * granting a *new* role access to a resource still requires that role to be added to
 * the relevant call site's allowedRoles list — a deliberate choice to widen an
 * endpoint's audience, kept separate from a matrix edit that only ever narrows it.
 * Routes migrated without an allowedRoles list rely on the matrix alone.
 *
 * @param session      NextAuth session object (or null for unauthenticated requests)
 * @param permission   "resource:action" key from the permission catalogue
 * @param allowedRoles Optional upper bound on which built-in roles may access this resource
 */
export async function can(
  session: Session | null,
  permission: string,
  allowedRoles: string[] = [],
): Promise<boolean> {
  if (!session?.user) return false;
  const { id, role } = session.user;

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) return false;

  const livePerms = await getCachedUserPermissions(id);
  return livePerms.has(permission);
}
