import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email().toLowerCase() });

// Shared silent-ok response — never vary the response body or status between
// "rate limited", "email not found", and "email sent". Any variation leaks
// whether the address exists in the system.
const OK = NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  // ── IP-level gate: 5 requests per 15 minutes per IP ──────────────────────
  // Stops bulk automation from a single network location.
  // Returns 200 OK (not 429) to prevent the attacker from knowing they are
  // throttled — otherwise they simply rotate IPs on each limit hit.
  const ip = getClientIp(req);
  const ipRl = await rateLimit(ip, "forgot-password:ip", { limit: 5, windowMs: 15 * 60_000 });
  if (!ipRl.success) return OK;

  const body = schema.safeParse(await req.json());
  if (!body.success) return OK; // Always succeed — prevent enumeration

  const { email } = body.data;

  // ── Email-level gate: 3 requests per hour per address ────────────────────
  // An attacker with many IPs can still spam a single inbox by sending a few
  // requests per IP. This bucket stops that by keying on the target address
  // itself. Also silent to prevent confirming the address exists.
  const emailRl = await rateLimit(email, "forgot-password:email", { limit: 3, windowMs: 60 * 60_000 });
  if (!emailRl.success) return OK;

  const user = await db.user.findUnique({ where: { email } });

  if (user) {
    // Delete any existing tokens for this email (one active reset at a time)
    await db.verificationToken.deleteMany({ where: { identifier: email } });

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60_000); // 1 hour

    await db.verificationToken.create({
      data: { identifier: email, token, expires },
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    await inngest.send({
      id: `pwd-reset-${user.id}-${token.slice(0, 8)}`,
      name: EVENTS.SEND_PASSWORD_RESET,
      data: { to: email, firstName: user.firstName, resetUrl, userId: user.id },
    }).catch((err) => console.error("[inngest] Failed to queue password reset email:", err));

    await auditLog({
      userId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "User",
      entityId: user.id,
      metadata: { email },
    });
  }

  return OK;
}
