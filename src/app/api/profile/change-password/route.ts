import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Parse and validate body first — malformed requests must not consume rate limit tokens.
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Reject obvious missing-field case before rate limit — no token consumed.
  if (user.passwordHash && !user.mustChangePassword && !body.data.currentPassword) {
    return NextResponse.json({ error: "Current password is required" }, { status: 400 });
  }

  // Rate limit: only well-formed attempts that will actually hit bcrypt consume a slot.
  // 5 per hour is generous for legitimate use (password managers), tight for brute force.
  const rl = await rateLimit(session.user.id, "change-password", { limit: 5, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many password change attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  // Verify current password for non-forced changes (after rate limit to prevent enumeration).
  if (user.passwordHash && !user.mustChangePassword) {
    const valid = await bcrypt.compare(body.data.currentPassword!, user.passwordHash);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const newHash = await bcrypt.hash(body.data.newPassword, 12);

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "USER_PASSWORD_CHANGED",
    entityType: "User",
    entityId: session.user.id,
    metadata: { forced: user.mustChangePassword },
  });

  return NextResponse.json({ ok: true });
}
