/**
 * GET /api/unsubscribe
 *
 * One-click unsubscribe endpoint (RFC 8058 / CAN-SPAM §7 / GDPR Art. 7(3)).
 *
 * This route is intentionally public (no session required) — the recipient
 * clicks the link from their email client without being logged in.
 *
 * SECURITY MODEL
 * ──────────────
 * The URL carries an HMAC-SHA256 token that is bound to the specific
 * (userId, purpose) pair:
 *
 *   token = HMAC-SHA256(AUTH_SECRET, "unsub:{userId}:{purpose}") hex
 *
 * An attacker who intercepts an unsubscribe URL for one user cannot
 * construct a valid URL for another user. Timing-safe comparison prevents
 * oracle attacks. The token does not expire — loss of AUTH_SECRET rotation
 * requires re-generating all tokens (inherent to HMAC-based approaches).
 *
 * WHAT IT DOES
 * ────────────
 * 1. Verify the HMAC token.
 * 2. Stamp withdrawnAt on any active ConsentRecord for (userId, purpose).
 * 3. Create a new ConsentRecord recording the withdrawal.
 * 4. Write an AUDIT_LOG entry.
 * 5. Return a minimal HTML confirmation page — no redirect to an auth-gated
 *    page (the user may not be logged in when they click from email).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { verifyUnsubscribeToken } from "@/lib/email";

// Purposes that can be withdrawn via this endpoint.
// Must match CONSENT_PURPOSE in src/lib/constants.ts.
const VALID_PURPOSES = new Set([
  "MARKETING",
  "DIRECTORY_LISTING",
  "RESEARCH",
  "CPD_TRACKING",
  "THIRD_PARTY_SHARING",
]);

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Truemark Global";

function htmlPage(heading: string, body: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${heading} — ${APP_NAME}</title>
  <style>
    body{margin:0;padding:40px 16px;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;}
    .card{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:40px 32px;}
    h1{margin:0 0 12px;font-size:20px;font-weight:700;}
    p{margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.6;}
    a{color:#1a3d8f;}
  </style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    ${body}
  </div>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId  = searchParams.get("userId");
  const purpose = searchParams.get("purpose");
  const token   = searchParams.get("token");

  // ── Parameter presence ────────────────────────────────────────────────────
  if (!userId || !purpose || !token) {
    return htmlPage(
      "Invalid unsubscribe link",
      `<p>This unsubscribe link is incomplete or has been corrupted. Please
         contact <a href="mailto:support@truemarkglobal.com">support@truemarkglobal.com</a>
         if you need help unsubscribing.</p>`,
    );
  }

  // ── Purpose allowlist ─────────────────────────────────────────────────────
  if (!VALID_PURPOSES.has(purpose)) {
    return htmlPage(
      "Invalid unsubscribe link",
      `<p>The consent category in this link is not recognised.</p>`,
    );
  }

  // ── HMAC token verification (timing-safe) ─────────────────────────────────
  if (!verifyUnsubscribeToken(userId, purpose, token)) {
    return htmlPage(
      "Invalid unsubscribe link",
      `<p>This unsubscribe link is invalid or has expired. Please
         contact <a href="mailto:support@truemarkglobal.com">support@truemarkglobal.com</a>
         if you need help.</p>`,
    );
  }

  // ── User existence check ──────────────────────────────────────────────────
  // Do not reveal whether the userId exists — return a success page either way
  // so this endpoint cannot be used to enumerate user IDs.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (user) {
    // Stamp withdrawnAt on any currently-active grant records for this purpose.
    await db.consentRecord.updateMany({
      where: { userId, purpose, withdrawnAt: null, granted: true },
      data: { withdrawnAt: new Date() },
    });

    // Create a new record capturing the withdrawal event (Art. 7(1) — full history).
    const ip = req.headers.get("x-real-ip")
      ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "unknown";

    await db.consentRecord.create({
      data: {
        userId,
        purpose,
        granted: false,
        withdrawnAt: new Date(),
        ipAddress: ip,
        userAgent: req.headers.get("user-agent") ?? "unknown",
      },
    });

    await auditLog({
      userId,
      action: "CONSENT_WITHDRAWN",
      entityType: "ConsentRecord",
      entityId: userId,
      metadata: { purpose, channel: "email_one_click_unsubscribe", ip },
    }).catch(() => {});
  }

  // Return success regardless of whether the user was found.
  const purposeLabel = purpose === "MARKETING" ? "marketing" : purpose.toLowerCase().replace(/_/g, " ");
  return htmlPage(
    "You have been unsubscribed",
    `<p>You will no longer receive ${purposeLabel} emails from ${APP_NAME}.</p>
     <p>You can review and manage all your communication preferences at any time by
        logging in to your account and visiting <strong>Settings → Privacy</strong>.</p>
     <p style="margin-top:24px;font-size:12px;color:#94a3b8;">
       If you unsubscribed by mistake, log in to your account to re-enable this preference.
     </p>`,
  );
}
