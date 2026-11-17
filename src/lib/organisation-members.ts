import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { withOrgContext } from "@/lib/rls";
import { inngest, EVENTS } from "@/inngest/client";
import { can } from "@/lib/permissions";
import { USER_ROLES } from "@/lib/constants";

// Shared by the single-member POST handler
// (src/app/api/organisations/[id]/members/route.ts) and the bulk-CSV route
// (src/app/api/organisations/[id]/members/bulk/route.ts) — same business
// logic and side effects (audit log, notification, consent records, welcome
// email) whether adding one member or many.

export type MemberOpResult =
  | { ok: true; member: unknown; status: number }
  | { ok: false; error: string; status: number };

/** Shared org-membership access check for the single and bulk member routes. */
export async function checkAccess(session: Session, orgId: string) {
  if (!(await can(session, "organisations:members"))) return false;
  if (session.user.role === USER_ROLES.ORG_MANAGER) {
    const m = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: session.user.id, organisationId: orgId } },
    });
    return !!m;
  }
  return true;
}

/** mode: "add" — link an existing account to this org. */
export async function addExistingMember(
  session: Session,
  org: { id: string; name: string },
  email: string,
  role: string,
  departmentId: string | undefined,
): Promise<MemberOpResult> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return {
      ok: false,
      status: 404,
      error: `No account found for ${email}. Provide a first/last name to create one.`,
    };
  }

  const existing = await db.organisationMember.findUnique({
    where: { userId_organisationId: { userId: user.id, organisationId: org.id } },
  });
  if (existing) return { ok: false, error: `${email} is already a member`, status: 409 };

  const member = await withOrgContext(db, org.id, async (tx) => {
    return tx.organisationMember.create({
      data: { userId: user.id, organisationId: org.id, role, departmentId: departmentId ?? null },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true } },
        department: { select: { id: true, name: true } },
      },
    });
  });

  await db.notification.create({
    data: {
      userId: user.id,
      type: "SYSTEM_ALERT",
      title: `You've been added to ${org.name}`,
      message: `${session.user.name} added you as a member of ${org.name}. You now have access to organisation courses and resources.`,
      link: "/dashboard",
    },
  }).catch(() => {});

  await auditLog({
    userId: session.user.id,
    action: "ORG_MEMBER_ADDED",
    entityType: "OrganisationMember",
    entityId: member.id,
    metadata: { orgId: org.id, orgName: org.name, memberEmail: email, memberRole: role },
  });

  return { ok: true, member, status: 201 };
}

/** mode: "create" — create a brand-new account (or link if the email already exists) and invite. */
export async function createAndAddMember(
  session: Session,
  org: { id: string; name: string },
  params: { firstName: string; lastName: string; email: string; role: string; departmentId?: string },
  req: { headers: { get(name: string): string | null } },
): Promise<MemberOpResult> {
  const { firstName, lastName, email, role, departmentId } = params;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    const alreadyMember = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: existing.id, organisationId: org.id } },
    });
    if (alreadyMember) return { ok: false, error: `A user with email ${email} is already a member`, status: 409 };

    const member = await withOrgContext(db, org.id, async (tx) => {
      return tx.organisationMember.create({
        data: { userId: existing.id, organisationId: org.id, role, departmentId: departmentId ?? null },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true } },
          department: { select: { id: true, name: true } },
        },
      });
    });

    await db.notification.create({
      data: {
        userId: existing.id,
        type: "SYSTEM_ALERT",
        title: `You've been added to ${org.name}`,
        message: `You have been added as a member of ${org.name}.`,
        link: "/dashboard",
      },
    }).catch(() => {});

    await auditLog({
      userId: session.user.id,
      action: "ORG_MEMBER_ADDED",
      entityType: "OrganisationMember",
      entityId: member.id,
      metadata: { orgId: org.id, orgName: org.name, memberEmail: email, memberRole: role, note: "existing_user_linked" },
    });

    return { ok: true, member: { ...member, existingUser: true }, status: 201 };
  }

  const unusableHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);

  const newUser = await db.user.create({
    data: {
      email,
      firstName,
      lastName,
      passwordHash: unusableHash,
      role: "CANDIDATE",
      status: "ACTIVE",
      emailVerified: new Date(),
      mustChangePassword: true,
    },
  });

  const member = await withOrgContext(db, org.id, async (tx) => {
    return tx.organisationMember.create({
      data: { userId: newUser.id, organisationId: org.id, role, departmentId: departmentId ?? null },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true } },
        department: { select: { id: true, name: true } },
      },
    });
  });

  await db.consentRecord.createMany({
    data: [
      {
        userId: newUser.id,
        purpose: "TERMS_AND_PRIVACY",
        granted: true,
        ipAddress: "org-invite",
        userAgent: req.headers.get("user-agent") ?? "unknown",
      },
      {
        userId: newUser.id,
        purpose: "MARKETING",
        granted: false,
        withdrawnAt: new Date(),
        ipAddress: "org-invite",
        userAgent: req.headers.get("user-agent") ?? "unknown",
      },
    ],
  }).catch((err) => console.error("[consent] Failed to create consent records:", err));

  const setPasswordToken = randomBytes(32).toString("hex");
  await db.verificationToken.upsert({
    where: { identifier_token: { identifier: email, token: setPasswordToken } },
    create: {
      identifier: email,
      token: setPasswordToken,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    },
    update: {},
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  const setPasswordUrl = `${appUrl}/reset-password?token=${setPasswordToken}&email=${encodeURIComponent(email)}`;

  await inngest.send({
    name: EVENTS.SEND_MEMBER_WELCOME,
    data: { to: email, firstName, orgName: org.name, setPasswordUrl, userId: newUser.id },
  }).catch((err) => console.error("[inngest] Failed to enqueue welcome email:", err));

  await auditLog({
    userId: session.user.id,
    action: "ORG_MEMBER_ADDED",
    entityType: "OrganisationMember",
    entityId: member.id,
    metadata: { orgId: org.id, orgName: org.name, memberEmail: email, memberRole: role, note: "new_user_created" },
  });

  return { ok: true, member: { ...member, newUser: true }, status: 201 };
}
