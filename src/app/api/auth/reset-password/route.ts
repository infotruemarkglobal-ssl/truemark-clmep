import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email().toLowerCase(),
  token: z.string().min(1),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

export async function POST(req: NextRequest) {
  // 5 attempts per hour per IP — tighter than forgot-password since the
  // attacker already has the token; guessing the password here is the last
  // line of defence against an intercepted reset link.
  const ip = getClientIp(req);
  const rl = await rateLimit(ip, "reset-password", { limit: 5, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { email, token, password } = body.data;

  const record = await db.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });

  if (!record) {
    return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
  }

  if (record.expires < new Date()) {
    await db.verificationToken.delete({ where: { identifier_token: { identifier: email, token } } });
    return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "Invalid reset link." }, { status: 400 });

  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  // Consume the token so it can't be reused
  await db.verificationToken.delete({ where: { identifier_token: { identifier: email, token } } });

  await auditLog({
    userId: user.id,
    action: "PASSWORD_RESET_COMPLETED",
    entityType: "User",
    entityId: user.id,
    metadata: { email },
  });

  return NextResponse.json({ ok: true });
}
