import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";
import { CACHE_TAGS } from "@/lib/cache";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const organisations = await db.organisation.findMany({
    include: { _count: { select: { members: true, purchases: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(organisations);
}

const schema = z.object({
  name: z.string().min(2),
  registrationNo: z.string().optional(),
  country: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  // Optional org manager to create alongside the org
  managerFirstName: z.string().min(1).optional(),
  managerLastName: z.string().min(1).optional(),
  managerEmail: z.string().email().optional(),
});

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { name, registrationNo, country, website, managerFirstName, managerLastName, managerEmail } = body.data;

  // Validate: if any manager field provided, all must be present
  const hasManager = managerFirstName || managerLastName || managerEmail;
  if (hasManager && (!managerFirstName || !managerLastName || !managerEmail)) {
    return NextResponse.json({ error: "Please provide first name, last name, and email for the org manager." }, { status: 400 });
  }

  const org = await db.organisation.create({
    data: {
      name,
      registrationNo: registrationNo ?? null,
      country: country ?? null,
      website: website || null,
    },
  });

  revalidateTag(CACHE_TAGS.org, {});

  await auditLog({
    userId: session.user.id,
    action: "ORGANISATION_CREATED",
    entityType: "Organisation",
    entityId: org.id,
    metadata: { name: org.name },
  });

  // Create org manager account if requested
  if (managerFirstName && managerLastName && managerEmail) {
    // Check if a user with this email already exists
    const existingUser = await db.user.findUnique({ where: { email: managerEmail } });

    let managerId: string;

    if (existingUser) {
      // Link existing user as org manager
      managerId = existingUser.id;
    } else {
      // Create new user with ORG_MANAGER role
      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      const newUser = await db.user.create({
        data: {
          email: managerEmail,
          firstName: managerFirstName,
          lastName: managerLastName,
          passwordHash,
          role: USER_ROLES.ORG_MANAGER,
          status: "ACTIVE",
          emailVerified: new Date(),
          mustChangePassword: true,
        },
      });

      managerId = newUser.id;

      // Send welcome email via Inngest background job
      await inngest.send({
        name: EVENTS.SEND_MEMBER_WELCOME,
        data: {
          to: managerEmail,
          firstName: managerFirstName,
          orgName: name,
          temporaryPassword: tempPassword,
        },
      }).catch((err) => console.error("[inngest] Failed to enqueue welcome email:", err));
    }

    // Link as org member with ORG_MANAGER role
    const alreadyMember = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: managerId, organisationId: org.id } },
    });

    if (!alreadyMember) {
      await db.organisationMember.create({
        data: { userId: managerId, organisationId: org.id, role: USER_ROLES.ORG_MANAGER },
      });
    }

    await auditLog({
      userId: session.user.id,
      action: "ORG_MEMBER_ADDED",
      entityType: "OrganisationMember",
      entityId: managerId,
      metadata: { orgId: org.id, orgName: name, managerEmail, role: USER_ROLES.ORG_MANAGER },
    });
  }

  return NextResponse.json(org, { status: 201 });
}
