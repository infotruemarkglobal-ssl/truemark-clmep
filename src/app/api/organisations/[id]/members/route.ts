import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { withOrgContext } from "@/lib/rls";
import { inngest, EVENTS } from "@/inngest/client";
import bcrypt from "bcryptjs";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.ORG_MANAGER];

async function checkAccess(userId: string, role: string, orgId: string) {
  if (!(ALLOWED as string[]).includes(role)) return false;
  if (role === USER_ROLES.ORG_MANAGER) {
    const m = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId: orgId } },
    });
    return !!m;
  }
  return true;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// GET /api/organisations/[id]/members — list members
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await checkAccess(session.user.id, session.user.role, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await db.organisationMember.findMany({
    where: { organisationId: id },
    include: {
      user: {
        select: {
          id: true, firstName: true, lastName: true, email: true,
          role: true, status: true,
          // Art. 5(1)(c) data minimisation: ORG_MANAGER does not need the exact
          // last-login timestamp — that is behavioural telemetry exceeding the need
          // of org-level course enrolment management. Status field is sufficient.
          enrolments: {
            select: {
              courseId: true, status: true, progress: true,
              course: { select: { title: true, slug: true } },
            },
          },
        },
      },
      department: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  return NextResponse.json(members);
}

// POST /api/organisations/[id]/members
//
// Two modes (determined by the `mode` field):
//   "add"    — add an existing user by email
//   "create" — create a brand-new account, send welcome email with temp password
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await checkAccess(session.user.id, session.user.role, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await db.organisation.findUnique({ where: { id } });
  if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

  const body = await req.json();
  const mode: "add" | "create" = body.mode ?? "add";

  // ── Mode: add existing user ────────────────────────────────────────────────
  if (mode === "add") {
    const schema = z.object({
      email: z.string().email(),
      role: z.enum(["CANDIDATE", "MEMBER", "SUPERVISOR", "MANAGER"]).default("CANDIDATE"),
      departmentId: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const { email, role, departmentId } = parsed.data;

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({
        error: `No account found for ${email}. Use the "Create & invite" option to create a new account.`,
      }, { status: 404 });
    }

    const existing = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: user.id, organisationId: id } },
    });
    if (existing) return NextResponse.json({ error: "User is already a member" }, { status: 409 });

    const member = await withOrgContext(db, id, async (tx) => {
      return tx.organisationMember.create({
        data: { userId: user.id, organisationId: id, role, departmentId: departmentId ?? null },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true } },
          department: { select: { id: true, name: true } },
        },
      });
    });

    // Notify the user
    await db.notification.create({
      data: {
        userId: user.id,
        type: "ORG_MEMBER_ADDED",
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
      metadata: { orgId: id, orgName: org.name, memberEmail: email, memberRole: role },
    });

    return NextResponse.json(member, { status: 201 });
  }

  // ── Mode: create new user and invite ──────────────────────────────────────
  if (mode === "create") {
    const schema = z.object({
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      email: z.string().email(),
      role: z.enum(["CANDIDATE", "MEMBER", "SUPERVISOR", "MANAGER"]).default("CANDIDATE"),
      departmentId: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const { firstName, lastName, email, role, departmentId } = parsed.data;

    // Check email not already taken
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      // User exists — just add them to the org instead
      const alreadyMember = await db.organisationMember.findUnique({
        where: { userId_organisationId: { userId: existing.id, organisationId: id } },
      });
      if (alreadyMember) return NextResponse.json({ error: "A user with that email is already a member" }, { status: 409 });

      const member = await withOrgContext(db, id, async (tx) => {
        return tx.organisationMember.create({
          data: { userId: existing.id, organisationId: id, role, departmentId: departmentId ?? null },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true } },
            department: { select: { id: true, name: true } },
          },
        });
      });

      await db.notification.create({
        data: {
          userId: existing.id,
          type: "ORG_MEMBER_ADDED",
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
        metadata: { orgId: id, orgName: org.name, memberEmail: email, memberRole: role, note: "existing_user_linked" },
      });

      return NextResponse.json({ ...member, existingUser: true }, { status: 201 });
    }

    // Create the new user with a random unusable password hash.
    // M (temp password in Inngest): we no longer put a cleartext temp password
    // in the Inngest event payload (which is visible in the Inngest run log).
    // Instead we create a password-set token and email a secure link.
    const unusableHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);

    const newUser = await db.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash: unusableHash,
        role: "CANDIDATE",          // platform role is always CANDIDATE
        status: "ACTIVE",
        emailVerified: new Date(),   // invited by org manager — skip email verification
        mustChangePassword: true,    // must set own password on first login
      },
    });

    const member = await withOrgContext(db, id, async (tx) => {
      return tx.organisationMember.create({
        data: { userId: newUser.id, organisationId: id, role, departmentId: departmentId ?? null },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true } },
          department: { select: { id: true, name: true } },
        },
      });
    });

    // ── GDPR Art. 7(1) — record consent for org-invited users ────────────────
    // Users created via this flow never saw the registration form, so we create
    // ConsentRecord entries on their behalf:
    //   TERMS_AND_PRIVACY: true — the org manager acts on behalf of their member;
    //     they accept the T&C during org registration (legal basis: legitimate interest).
    //   MARKETING: false — no explicit opt-in was collected from the individual,
    //     so we default to opted-out. The user can opt in from their profile.
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
          withdrawnAt: new Date(), // default opted-out for org-invited members
          ipAddress: "org-invite",
          userAgent: req.headers.get("user-agent") ?? "unknown",
        },
      ],
    }).catch((err) => console.error("[consent] Failed to create consent records:", err));

    // Create a password-set token (same mechanism as forgot-password) so the
    // member can choose their own password without ever receiving one in email.
    // Token expires in 7 days — enough time for the invite to be acted on.
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

    // Dispatch welcome email as a background job (Inngest) — non-blocking.
    // setPasswordUrl is passed instead of a cleartext password.
    await inngest.send({
      name: EVENTS.SEND_MEMBER_WELCOME,
      data: { to: email, firstName, orgName: org.name, setPasswordUrl, userId: newUser.id },
    }).catch((err) => console.error("[inngest] Failed to enqueue welcome email:", err));

    await auditLog({
      userId: session.user.id,
      action: "ORG_MEMBER_ADDED",
      entityType: "OrganisationMember",
      entityId: member.id,
      metadata: { orgId: id, orgName: org.name, memberEmail: email, memberRole: role, note: "new_user_created" },
    });

    return NextResponse.json({ ...member, newUser: true }, { status: 201 });
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
}
