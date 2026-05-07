import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { inngest, EVENTS } from "@/inngest/client";

const baseSchema = z.object({
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  email: z.string().email().toLowerCase(),
  phone: z.string().optional(),
  password: z
    .string()
    .min(12)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
  consentMarketing: z.boolean().optional().default(false),
  consentTerms: z.literal(true, { error: "You must accept the terms to continue" }),
  accountType: z.enum(["individual", "organisation"]).default("individual"),
  orgName: z.string().min(2).max(200).optional(),
  orgRegistrationNo: z.string().optional(),
  orgCountry: z.string().optional(),
  orgWebsite: z.string().url().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  // 5 registrations per hour per IP — enough for a legitimate shared-IP office;
  // tight enough to slow credential-stuffing automation.
  const ip = getClientIp(req);
  const rl = await rateLimit(ip, "register", { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const body = baseSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input", details: body.error.flatten() }, { status: 400 });
  }

  const {
    firstName, lastName, email, phone, password,
    consentMarketing, accountType,
    orgName, orgRegistrationNo, orgCountry, orgWebsite,
  } = body.data;

  if (accountType === "organisation" && !orgName) {
    return NextResponse.json({ error: "Organisation name is required" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // Always return 201 to prevent email enumeration
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const role = accountType === "organisation" ? "ORG_MANAGER" : "CANDIDATE";

  const user = await db.user.create({
    data: {
      firstName,
      lastName,
      email,
      phone: phone ?? null,
      passwordHash,
      role,
      status: "PENDING_VERIFICATION",
      emailVerified: null,
    },
  });

  // Individual candidates get a profile stamped as INDIVIDUAL at registration.
  if (accountType === "individual") {
    await db.candidateProfile.create({
      data: { userId: user.id, registrationType: "INDIVIDUAL" },
    });
  }

  // If organisation account, create the org and link the user as ORG_MANAGER
  if (accountType === "organisation" && orgName) {
    const org = await db.organisation.create({
      data: {
        name: orgName,
        registrationNo: orgRegistrationNo || null,
        country: orgCountry || null,
        website: orgWebsite || null,
        isActive: true,
      },
    });

    await db.organisationMember.create({
      data: { userId: user.id, organisationId: org.id, role: "ORG_MANAGER" },
    });

    await auditLog({
      userId: user.id,
      action: "ORG_REGISTERED",
      entityType: "Organisation",
      entityId: org.id,
      metadata: { orgName, email, role },
    });
  }

  // Record GDPR consent — two records created at registration:
  // 1. TERMS_AND_PRIVACY — the mandatory acceptance of T&C/Privacy Policy.
  //    Art. 7(1): controller must be able to demonstrate consent was given,
  //    including the IP, user agent, and timestamp of acceptance.
  // 2. MARKETING — the optional marketing email consent (may be false).
  const consentIp = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  await db.consentRecord.createMany({
    data: [
      {
        userId: user.id,
        purpose: "TERMS_AND_PRIVACY",
        granted: true, // validated as z.literal(true) by the schema — cannot reach here if false
        ipAddress: consentIp,
        userAgent: ua,
      },
      {
        userId: user.id,
        purpose: "MARKETING",
        granted: consentMarketing,
        ipAddress: consentIp,
        userAgent: ua,
      },
    ],
  });

  await auditLog({
    userId: user.id,
    action: "USER_REGISTERED",
    entityType: "User",
    entityId: user.id,
    metadata: { email, role },
  });

  // Generate email verification token (24-hour expiry)
  await db.verificationToken.deleteMany({ where: { identifier: email } });
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.verificationToken.create({ data: { identifier: email, token, expires } });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
  await inngest.send({
    id: `email-verify-${user.id}`,
    name: EVENTS.SEND_EMAIL_VERIFICATION,
    data: { to: email, firstName, verifyUrl, userId: user.id },
  });
  
  return NextResponse.json({ ok: true }, { status: 201 });
}
