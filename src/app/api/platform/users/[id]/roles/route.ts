import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { can } from "@/lib/permissions";

const ROLE_PRIORITY: Record<string, number> = {
  SUPER_ADMIN: 9, CERTIFICATION_OFFICER: 8, EXAMINER: 7, TRAINER: 6,
  PROCTOR: 5, AUDITOR: 4, ORG_MANAGER: 3, SUPPORT_AGENT: 2, CANDIDATE: 1,
};

// Only platform-wide (organisationId: null) rows count toward the user's
// base role / allowedRoles ceilings — an org-scoped grant must only ever
// widen what a user can see/do within that org, never elevate them
// platform-wide. Without this, an org-scoped TRAINER-flavored custom role
// would silently let its holder pass allowedRoles: ["TRAINER", ...] checks
// everywhere, not just for the org it was scoped to.
async function highestBaseRole(userId: string): Promise<string> {
  const roles = await db.userCustomRole.findMany({
    where: { userId, organisationId: null },
    select: { role: { select: { baseRole: true } } },
  });
  if (roles.length === 0) return "CANDIDATE";
  return roles.reduce((best, r) => {
    const p = ROLE_PRIORITY[r.role.baseRole] ?? 0;
    return p > (ROLE_PRIORITY[best] ?? 0) ? r.role.baseRole : best;
  }, "CANDIDATE");
}


// GET /api/platform/users/[id]/roles — get roles assigned to a user
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await can(session, "permissions:manage", ["SUPER_ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: userId } = await params;

  const assignments = await db.userCustomRole.findMany({
    where: { userId },
    include: {
      role: { select: { id: true, name: true, isSystem: true } },
      organisation: { select: { id: true, name: true } },
    },
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
  if (!await can(session, "permissions:manage", ["SUPER_ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: userId } = await params;

  const schema = z.object({ roleId: z.string(), organisationId: z.string().nullable().optional() });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const organisationId = parsed.data.organisationId ?? null;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const role = await db.customRole.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  if (organisationId) {
    const org = await db.organisation.findUnique({ where: { id: organisationId }, select: { id: true } });
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  // Capture before state for the before/after audit snapshot. No natural key
  // to upsert on anymore (organisationId is nullable, and Postgres treats
  // each NULL as distinct in a unique index), so this existence check is the
  // actual duplicate guard for the platform-wide (organisationId: null) case.
  const existingAssignment = await db.userCustomRole.findFirst({
    where: { userId, roleId: parsed.data.roleId, organisationId },
  });
  if (existingAssignment) {
    return NextResponse.json({ error: "This role is already assigned for that scope" }, { status: 409 });
  }

  const assignment = await db.userCustomRole.create({
    data: { userId, roleId: parsed.data.roleId, organisationId, assignedBy: session.user.id },
  });

  // Recalculate the user's built-in role as the highest baseRole among all
  // their custom roles so assigning a lower-priority role never downgrades them.
  const newBaseRole = await highestBaseRole(userId);
  await db.user.update({
    where: { id: userId },
    data: { role: newBaseRole },
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
      organisationId,
      before: { hasRole: false },
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
  if (!await can(session, "permissions:manage", ["SUPER_ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: userId } = await params;

  const schema = z.object({ roleId: z.string(), organisationId: z.string().nullable().optional() });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const organisationId = parsed.data.organisationId ?? null;

  // Fetch role name before removing so it appears in the audit snapshot.
  const roleToRemove = await db.customRole.findUnique({
    where: { id: parsed.data.roleId },
    select: { name: true },
  });

  // Matches on all three fields — a role can now have multiple rows per
  // user (one platform-wide, several org-scoped), so roleId alone is no
  // longer enough to identify which assignment to remove.
  await db.userCustomRole.deleteMany({
    where: { userId, roleId: parsed.data.roleId, organisationId },
  });

  // Recalculate user.role from remaining custom roles; if none remain, reset to CANDIDATE.
  const newBaseRole = await highestBaseRole(userId);
  await db.user.update({ where: { id: userId }, data: { role: newBaseRole } });

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
