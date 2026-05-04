import nodemailer from "nodemailer";
import { createHmac, timingSafeEqual } from "crypto";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST ?? "localhost",
  port: Number(process.env.EMAIL_SERVER_PORT ?? 1025),
  secure: Number(process.env.EMAIL_SERVER_PORT ?? 1025) === 465,
  auth:
    process.env.EMAIL_SERVER_USER
      ? { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD }
      : undefined,
});

const FROM = process.env.EMAIL_FROM ?? "noreply@truemarkglobal.com";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Truemark Global";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

// CAN-SPAM Act §7 — all commercial email must include a physical postal address.
// Update this constant if the registered office address changes.
const POSTAL_ADDRESS = "Truemark Global Limited, 12 Certification Drive, Victoria Island, Lagos, Nigeria";

// ─── Unsubscribe token ────────────────────────────────────────────────────────
//
// One-click unsubscribe (RFC 8058) requires that the MUA can POST to the
// List-Unsubscribe URL without the user having to log in. We use an HMAC-SHA256
// token so the endpoint is stateless but unforgeable:
//
//   token = HMAC-SHA256(AUTH_SECRET, "unsub:{userId}:{purpose}") hex
//
// Verification is timing-safe (crypto.timingSafeEqual) to prevent oracle attacks.
// The token is bound to a specific (userId, purpose) pair so a token for
// MARKETING cannot be repurposed to withdraw DIRECTORY_LISTING consent.

export function generateUnsubscribeToken(userId: string, purpose: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — unsubscribe tokens cannot be generated");
  return createHmac("sha256", secret)
    .update(`unsub:${userId}:${purpose}`)
    .digest("hex");
}

export function verifyUnsubscribeToken(userId: string, purpose: string, token: string): boolean {
  const expected = generateUnsubscribeToken(userId, purpose);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(token, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function unsubscribeUrl(userId: string, purpose = "MARKETING"): string {
  const token = generateUnsubscribeToken(userId, purpose);
  return (
    `${APP_URL}/api/unsubscribe` +
    `?userId=${encodeURIComponent(userId)}` +
    `&purpose=${encodeURIComponent(purpose)}` +
    `&token=${token}`
  );
}

// ─── Shared HTML wrapper ──────────────────────────────────────────────────────

/**
 * @param body        Main email body HTML
 * @param unsubLink   If provided, renders an unsubscribe link in the footer.
 *                    Required for commercial/marketing emails under CAN-SPAM §5
 *                    and GDPR (any email not strictly transactional).
 *                    Must be a fully-qualified URL to /api/unsubscribe.
 */
function wrap(body: string, unsubLink?: string): string {
  const footerExtra = unsubLink
    ? `<br/>To stop receiving these emails, <a href="${unsubLink}" style="color:#1a3d8f;">unsubscribe here</a>.`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;max-width:560px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#1a3d8f;padding:28px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${APP_NAME}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#93c5fd;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;">Certification Portal</p>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:32px;">${body}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;">
            <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
              This email was sent by ${APP_NAME}. If you have questions, contact
              <a href="mailto:support@truemarkglobal.com" style="color:#1a3d8f;">support@truemarkglobal.com</a>.${footerExtra}<br/>
              ${POSTAL_ADDRESS}<br/>
              © ${new Date().getFullYear()} Truemark Global Limited. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Email: Verify email address (transactional — no unsubscribe required) ───
//
// Purely transactional: the user triggered this by creating an account.
// CAN-SPAM §7(a)(3)(A) / GDPR Art. 6(1)(b) — no marketing consent needed.

export async function sendEmailVerificationEmail({
  to,
  firstName,
  verifyUrl,
}: {
  to: string;
  firstName: string;
  verifyUrl: string;
}) {
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Verify your email address</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
      Hi ${firstName}, thanks for creating your ${APP_NAME} account.
      Please verify your email address to activate it. This link expires in <strong>24 hours</strong>.
    </p>

    <a href="${verifyUrl}" style="display:inline-block;background:#1a3d8f;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Verify my email →
    </a>

    <p style="margin:28px 0 0;font-size:12px;color:#94a3b8;">
      If you didn't create an account on ${APP_NAME}, you can safely ignore this email.
    </p>
  `);

  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to,
    subject: `Verify your ${APP_NAME} email address`,
    html,
    text: `Hi ${firstName},\n\nVerify your email here: ${verifyUrl}\n\nThis link expires in 24 hours.\n\n${POSTAL_ADDRESS}`,
  });
}

// ─── Email: Password reset (transactional — no unsubscribe required) ──────────
//
// Transactional: user-initiated account-recovery action.
// Token is single-use (deleted after verification) and expires in 1 hour.

export async function sendPasswordResetEmail({
  to,
  firstName,
  resetUrl,
}: {
  to: string;
  firstName: string;
  resetUrl: string;
}) {
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Reset your password</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
      Hi ${firstName}, we received a request to reset the password for your ${APP_NAME} account.
      Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
    </p>

    <a href="${resetUrl}" style="display:inline-block;background:#1a3d8f;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Reset my password →
    </a>

    <p style="margin:28px 0 0;font-size:12px;color:#94a3b8;">
      If you didn't request a password reset, you can safely ignore this email — your password will not change.<br/>
      For security, this link can only be used once and expires after 1 hour.
    </p>
  `);

  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to,
    subject: `Reset your ${APP_NAME} password`,
    html,
    text: `Hi ${firstName},\n\nReset your password here: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.\n\n${POSTAL_ADDRESS}`,
  });
}

// ─── Email: New member welcome (relationship — unsubscribe provided) ──────────
//
// This is a relationship email (account creation triggered by an org manager),
// not a promotional email. Unsubscribe is provided as a courtesy; calling code
// should still check whether MARKETING consent is explicitly withdrawn before
// dispatching this via Inngest.
//
// userId is required so we can generate a signed, per-user unsubscribe token.

export async function sendMemberWelcomeEmail({
  to,
  firstName,
  orgName,
  setPasswordUrl,
  userId,
}: {
  to: string;
  firstName: string;
  orgName: string;
  setPasswordUrl: string;
  userId: string;
}) {
  const unsubLink = unsubscribeUrl(userId, "MARKETING");

  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Welcome to ${APP_NAME}</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
      Hi ${firstName}, you have been added as a member of <strong>${orgName}</strong> on the ${APP_NAME} Certification Portal.
    </p>

    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#0369a1;">Your account</p>
      <p style="margin:0;font-size:13px;color:#0f172a;">Email: <strong>${to}</strong></p>
      <p style="margin:8px 0 0;font-size:13px;color:#475569;">
        Use the button below to set your password and activate your account. The link expires in 7 days.
      </p>
    </div>

    <a href="${setPasswordUrl}" style="display:inline-block;background:#1a3d8f;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Set your password →
    </a>

    <p style="margin:28px 0 0;font-size:12px;color:#94a3b8;">
      If you did not expect this invitation, please ignore this email or contact
      <a href="mailto:support@truemarkglobal.com" style="color:#1a3d8f;">support@truemarkglobal.com</a>.
    </p>
  `, unsubLink);

  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to,
    subject: `You've been added to ${orgName} — ${APP_NAME}`,
    html,
    text: `Hi ${firstName},\n\nYou have been added as a member of ${orgName} on ${APP_NAME}.\n\nEmail: ${to}\n\nSet your password here (expires in 7 days): ${setPasswordUrl}\n\nTo unsubscribe: ${unsubLink}\n\n${POSTAL_ADDRESS}`,
    headers: {
      "List-Unsubscribe": `<${unsubLink}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

// ─── Email: Enrolment confirmation (relationship — unsubscribe provided) ──────
//
// Transactional under CAN-SPAM (confirms a purchase / enrolment the user made).
// Unsubscribe is provided as a courtesy and is honoured by the Inngest function
// before dispatching — if MARKETING consent is explicitly withdrawn, the email
// is skipped.

export async function sendEnrolmentConfirmationEmail({
  to,
  firstName,
  courseTitle,
  courseSlug,
  userId,
}: {
  to: string;
  firstName: string;
  courseTitle: string;
  courseSlug: string;
  userId: string;
}) {
  const courseUrl = `${APP_URL}/courses/${courseSlug}`;
  const unsubLink = unsubscribeUrl(userId, "MARKETING");

  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Enrolment Confirmed</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
      Hi ${firstName}, you are now enrolled in the following programme.
    </p>

    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;margin-bottom:28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#16a34a;">Programme</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">${courseTitle}</p>
    </div>

    <a href="${courseUrl}" style="display:inline-block;background:#1a3d8f;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Start learning →
    </a>
  `, unsubLink);

  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to,
    subject: `Enrolment confirmed: ${courseTitle}`,
    html,
    text: `Hi ${firstName},\n\nYou are now enrolled in ${courseTitle}.\n\nStart learning: ${courseUrl}\n\nTo unsubscribe: ${unsubLink}\n\n${POSTAL_ADDRESS}`,
    headers: {
      "List-Unsubscribe": `<${unsubLink}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

// ─── Email: Exam result (transactional — no unsubscribe required) ─────────────
//
// Purely transactional: the user took an exam and the system is reporting their
// own result. No marketing content. CAN-SPAM §7(a)(3)(A) exempts this.
//
// The link goes to the specific attempt result page, not the generic exam list,
// so the candidate lands directly on their result without searching.

export async function sendExamResultEmail({
  to,
  firstName,
  examTitle,
  passed,
  score,
  attemptId,
}: {
  to: string;
  firstName: string;
  examTitle: string;
  passed: boolean;
  score: number;
  attemptId: string;
}) {
  const statusColor = passed ? "#16a34a" : "#dc2626";
  const statusBg = passed ? "#f0fdf4" : "#fef2f2";
  const statusBorder = passed ? "#86efac" : "#fca5a5";
  const statusText = passed ? "PASSED" : "NOT PASSED";
  const resultUrl = `${APP_URL}/exams/result/${attemptId}`;

  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Examination Result</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">Hi ${firstName}, your result for the following examination is now available.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">Examination</p>
      <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${examTitle}</p>
    </div>

    <div style="background:${statusBg};border:1px solid ${statusBorder};border-radius:8px;padding:20px;margin-bottom:28px;text-align:center;">
      <p style="margin:0 0 6px;font-size:28px;font-weight:800;color:${statusColor};">${score}%</p>
      <p style="margin:0;font-size:14px;font-weight:700;color:${statusColor};letter-spacing:1px;">${statusText}</p>
    </div>

    <a href="${resultUrl}" style="display:inline-block;background:#1a3d8f;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      View full results →
    </a>
  `);

  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to,
    subject: `Your exam result: ${examTitle}`,
    html,
    text: `Hi ${firstName},\n\nYour result for "${examTitle}" is available.\n\nScore: ${score}%\nResult: ${statusText}\n\nView details: ${resultUrl}\n\n${POSTAL_ADDRESS}`,
  });
}

// ─── Certificate expiry warning email (relationship — unsubscribe provided) ───
//
// Relationship email: the user holds an active certification and we are
// notifying them of an event related to that certification. Not promotional.
// GDPR Art. 6(1)(f) legitimate interest — helping the certificant avoid lapse.
//
// Unsubscribe is provided so the recipient can opt out. The Inngest function
// checks whether MARKETING consent has been explicitly withdrawn before sending.
//
// NOTE: the renewal URL currently links to the certificate details page.
// A dedicated /certificates/[id]/renew workflow page is tracked as a TODO.

export async function sendCertificateExpiryWarningEmail({
  to,
  firstName,
  certificateNumber,
  schemeName,
  expiresAt,
  daysRemaining,
  renewalUrl,
  userId,
}: {
  to: string;
  firstName: string;
  certificateNumber: string;
  schemeName: string;
  expiresAt: Date;
  daysRemaining: number;
  renewalUrl: string;
  userId: string;
}) {
  const unsubLink = unsubscribeUrl(userId, "MARKETING");
  const urgency = daysRemaining <= 30 ? "urgent" : daysRemaining <= 90 ? "warning" : "notice";
  const badgeColor = urgency === "urgent" ? "#dc2626" : urgency === "warning" ? "#d97706" : "#1a3d8f";
  const badgeBg = urgency === "urgent" ? "#fef2f2" : urgency === "warning" ? "#fffbeb" : "#eff6ff";
  const badgeBorder = urgency === "urgent" ? "#fca5a5" : urgency === "warning" ? "#fcd34d" : "#93c5fd";

  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Certificate Expiry ${urgency === "urgent" ? "Alert" : "Notice"}</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">Hi ${firstName}, your ISO/IEC 17024 certification is approaching its expiry date.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:16px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">Certification</p>
      <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${schemeName}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Certificate No: ${certificateNumber}</p>
    </div>

    <div style="background:${badgeBg};border:1px solid ${badgeBorder};border-radius:8px;padding:20px;margin-bottom:28px;text-align:center;">
      <p style="margin:0 0 4px;font-size:32px;font-weight:800;color:${badgeColor};">${daysRemaining}</p>
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:${badgeColor};">days until expiry</p>
      <p style="margin:0;font-size:13px;color:#64748b;">Expires on ${expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
    </div>

    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
      To maintain your certified status, you must complete the renewal process before this date.
      Renewal typically requires meeting the CPD hours requirement for your scheme.
    </p>

    <a href="${renewalUrl}" style="display:inline-block;background:${badgeColor};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Start renewal process →
    </a>
  `, unsubLink);

  const urgencyLabel = daysRemaining <= 30 ? "URGENT: " : "";
  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to,
    subject: `${urgencyLabel}Your ${schemeName} certificate expires in ${daysRemaining} days`,
    html,
    text: [
      `Hi ${firstName},`,
      ``,
      `Your ${schemeName} certificate (${certificateNumber}) expires in ${daysRemaining} days.`,
      `Expiry date: ${expiresAt.toLocaleDateString()}`,
      ``,
      `To renew: ${renewalUrl}`,
      ``,
      `To stop receiving these reminders: ${unsubLink}`,
      ``,
      POSTAL_ADDRESS,
    ].join("\n"),
    headers: {
      "List-Unsubscribe": `<${unsubLink}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

// ─── Email: GDPR Art. 33 breach DPA reminder (internal / transactional) ──────
//
// Sent to SUPER_ADMIN and DPO 48 hours after breach discovery if the breach
// has not yet been reported to the supervisory authority. Purely operational —
// no marketing consent required, no unsubscribe link.

export async function sendBreachReminderEmail({
  to,
  firstName,
  breachTitle,
  severity,
  dpaDeadline,
  hoursRemaining,
  breachUrl,
}: {
  to: string;
  firstName: string;
  breachTitle: string;
  severity: string;
  dpaDeadline: Date;
  hoursRemaining: number;
  breachUrl: string;
}) {
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#dc2626;">
      GDPR Art. 33 — DPA Notification Deadline Approaching
    </h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">Hi ${firstName}, this is an automated 48-hour compliance reminder.</p>

    <div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:20px;margin-bottom:20px;text-align:center;">
      <p style="margin:0 0 4px;font-size:40px;font-weight:800;color:#dc2626;">${hoursRemaining}</p>
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#dc2626;">hours remaining to notify the DPA</p>
      <p style="margin:0;font-size:13px;color:#64748b;">Deadline: ${dpaDeadline.toLocaleString("en-GB")}</p>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">Breach</p>
      <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#0f172a;">${breachTitle}</p>
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">Severity</p>
      <p style="margin:0;font-size:14px;font-weight:700;color:#dc2626;">${severity.toUpperCase()}</p>
    </div>

    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
      Under <strong>GDPR Article 33</strong>, a personal data breach must be notified to the competent
      supervisory authority within <strong>72 hours</strong> of becoming aware of it, unless it is unlikely
      to result in a risk to natural persons. This breach has <strong>not yet been marked as reported</strong>.
    </p>

    <a href="${breachUrl}"
       style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Review breach and report to DPA →
    </a>
  `);

  await transporter.sendMail({
    from: `"${APP_NAME} Compliance" <${FROM}>`,
    to,
    subject: `URGENT — ~${hoursRemaining}h left to notify DPA of data breach`,
    html,
    text: [
      `Hi ${firstName},`,
      ``,
      `GDPR Art. 33 — DPA notification deadline approaching.`,
      ``,
      `Breach: ${breachTitle}`,
      `Severity: ${severity.toUpperCase()}`,
      `Deadline: ${dpaDeadline.toLocaleString("en-GB")}`,
      `Hours remaining: ~${hoursRemaining}`,
      ``,
      `This breach has NOT been marked as reported to the supervisory authority.`,
      `Immediate action required: ${breachUrl}`,
      ``,
      POSTAL_ADDRESS,
    ].join("\n"),
  });
}
