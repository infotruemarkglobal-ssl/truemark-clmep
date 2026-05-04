/**
 * Inngest background functions for transactional email.
 *
 * RELIABILITY MODEL
 * ─────────────────
 * Every send is wrapped in step.run(). Inngest memoises completed steps — on a
 * retry the step is skipped (result replayed from the run log) so the recipient
 * never receives duplicate emails even after a transient failure after send.
 *
 * IDEMPOTENCY KEYS
 * ─────────────────
 * Callers should set a stable `id` on the Inngest event when the email is
 * deterministically tied to a single action:
 *
 *   await inngest.send({
 *     id: `member-welcome-${userId}`,   // prevents duplicate events too
 *     name: EVENTS.SEND_MEMBER_WELCOME,
 *     data: { ... },
 *   });
 *
 * Inngest deduplicates events with the same `id` within a 24-hour window, so
 * double-sends from application code are also prevented.
 *
 * ON FAILURE
 * ─────────────────
 * Each function has an `onFailure` handler that fires once after all retries are
 * exhausted. It logs to Sentry so the on-call engineer is alerted.
 *
 * CONSENT
 * ─────────────────
 * Relationship emails (enrolment confirm) honour explicit MARKETING withdrawal:
 * if the user has withdrawn MARKETING consent, the email is silently skipped.
 * This satisfies GDPR Art. 7(3) and CAN-SPAM §7.
 */

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { inngest, EVENTS } from "@/inngest/client";
import { db } from "@/lib/db";
import {
  sendMemberWelcomeEmail,
  sendEnrolmentConfirmationEmail,
  sendExamResultEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
} from "@/lib/email";

// ─── Zod schemas (validated once at job entry, not inside the step) ───────────

const memberWelcomeSchema = z.object({
  to: z.string().email(),
  firstName: z.string().min(1),
  orgName: z.string().min(1),
  setPasswordUrl: z.string().url(),
  userId: z.string().min(1),
});

const enrolmentConfirmSchema = z.object({
  to: z.string().email(),
  firstName: z.string().min(1),
  courseTitle: z.string().min(1),
  courseSlug: z.string().min(1),
  userId: z.string().min(1),
});

const examResultSchema = z.object({
  to: z.string().email(),
  firstName: z.string().min(1),
  examTitle: z.string().min(1),
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  attemptId: z.string(),
  userId: z.string().min(1),
});

const emailVerificationSchema = z.object({
  to: z.string().email(),
  firstName: z.string().min(1),
  verifyUrl: z.string().url(),
  userId: z.string().min(1),
});

const passwordResetSchema = z.object({
  to: z.string().email(),
  firstName: z.string().min(1),
  resetUrl: z.string().url(),
  userId: z.string().min(1),
});

// ─── Shared onFailure handler ─────────────────────────────────────────────────

function makeOnFailure(functionId: string) {
  return async ({
    event,
    error,
  }: {
    event: { data: unknown; name: string };
    error: Error;
  }) => {
    // All retries exhausted — report to Sentry so on-call is paged
    Sentry.captureException(error, {
      tags: { inngest_function: functionId },
      extra: { event },
    });
    console.error(
      `[inngest:${functionId}] All retries exhausted. Event: ${JSON.stringify(event)}`,
      error,
    );
  };
}

// ─── Consent guard helper ─────────────────────────────────────────────────────
//
// Returns true if the user has EXPLICITLY withdrawn MARKETING consent.
// "No record" (e.g. org-invited users who never saw the consent form) is treated
// as "not opted out" — we do not suppress email just because the record is absent.
// Only a positive withdrawal (granted: false, withdrawnAt set) suppresses sends.

async function isMarketingWithdrawn(userId: string): Promise<boolean> {
  const latest = await db.consentRecord.findFirst({
    where: { userId, purpose: "MARKETING" },
    orderBy: { grantedAt: "desc" },
    select: { granted: true, withdrawnAt: true },
  });
  // No record → not withdrawn; explicit false → withdrawn
  return latest !== null && !latest.granted && latest.withdrawnAt !== null;
}

// ─── Send member welcome email ────────────────────────────────────────────────

export const sendMemberWelcome = inngest.createFunction(
  {
    id: "send-member-welcome",
    name: "Send member welcome email",
    retries: 3,
    triggers: [{ event: EVENTS.SEND_MEMBER_WELCOME }],
    onFailure: makeOnFailure("send-member-welcome"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: unknown };
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    // Validate payload first — a bad payload should NOT retry (it will never fix itself)
    const parsed = memberWelcomeSchema.safeParse(event.data);
    if (!parsed.success) {
      console.error("[send-member-welcome] Invalid payload:", parsed.error.flatten());
      return { ok: false, error: "INVALID_PAYLOAD", issues: parsed.error.flatten() };
    }

    const { to, firstName, orgName, setPasswordUrl, userId } = parsed.data;

    // step.run() is memoised — if this step already completed on a prior run,
    // Inngest replays the cached result without calling sendMail again.
    await step.run("send-email", async () => {
      await sendMemberWelcomeEmail({ to, firstName, orgName, setPasswordUrl, userId });
    });

    return { ok: true, to };
  },
);

// ─── Send enrolment confirmation email ───────────────────────────────────────

export const sendEnrolmentConfirm = inngest.createFunction(
  {
    id: "send-enrolment-confirm",
    name: "Send enrolment confirmation email",
    retries: 3,
    triggers: [{ event: EVENTS.SEND_ENROLMENT_CONFIRM }],
    onFailure: makeOnFailure("send-enrolment-confirm"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: unknown };
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    const parsed = enrolmentConfirmSchema.safeParse(event.data);
    if (!parsed.success) {
      console.error("[send-enrolment-confirm] Invalid payload:", parsed.error.flatten());
      return { ok: false, error: "INVALID_PAYLOAD", issues: parsed.error.flatten() };
    }

    const { to, firstName, courseTitle, courseSlug, userId } = parsed.data;

    // ── Consent check ─────────────────────────────────────────────────────
    // Enrolment confirmation is a relationship email (CAN-SPAM transactional)
    // but we honour explicit MARKETING withdrawal as a courtesy.
    // If the user has withdrawn, skip silently — they paid for the course, so
    // they still have access; they just don't want the confirmation email.
    const withdrawn = await step.run("check-consent", () => isMarketingWithdrawn(userId));
    if (withdrawn) {
      return { ok: true, to, skipped: true, reason: "MARKETING_CONSENT_WITHDRAWN" };
    }

    await step.run("send-email", async () => {
      await sendEnrolmentConfirmationEmail({ to, firstName, courseTitle, courseSlug, userId });
    });

    return { ok: true, to };
  },
);

// ─── Send exam result email ───────────────────────────────────────────────────

export const sendExamResult = inngest.createFunction(
  {
    id: "send-exam-result",
    name: "Send exam result email",
    retries: 3,
    triggers: [{ event: EVENTS.SEND_EXAM_RESULT }],
    onFailure: makeOnFailure("send-exam-result"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: unknown };
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    const parsed = examResultSchema.safeParse(event.data);
    if (!parsed.success) {
      console.error("[send-exam-result] Invalid payload:", parsed.error.flatten());
      return { ok: false, error: "INVALID_PAYLOAD", issues: parsed.error.flatten() };
    }

    // attemptId is used to construct the deep link to the specific result page.
    // Purely transactional — no consent check required.
    const { to, firstName, examTitle, passed, score, attemptId } = parsed.data;

    await step.run("send-email", async () => {
      await sendExamResultEmail({ to, firstName, examTitle, passed, score, attemptId });
    });

    return { ok: true, to };
  },
);

// ─── Send email verification ──────────────────────────────────────────────────

export const sendEmailVerification = inngest.createFunction(
  {
    id: "send-email-verification",
    name: "Send email verification",
    retries: 3,
    triggers: [{ event: EVENTS.SEND_EMAIL_VERIFICATION }],
    onFailure: makeOnFailure("send-email-verification"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: unknown };
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    const parsed = emailVerificationSchema.safeParse(event.data);
    if (!parsed.success) {
      console.error("[send-email-verification] Invalid payload:", parsed.error.flatten());
      return { ok: false, error: "INVALID_PAYLOAD", issues: parsed.error.flatten() };
    }
    const { to, firstName, verifyUrl } = parsed.data;
    await step.run("send-email", async () => {
      await sendEmailVerificationEmail({ to, firstName, verifyUrl });
    });
    return { ok: true, to };
  },
);

// ─── Send password reset email ────────────────────────────────────────────────

export const sendPasswordReset = inngest.createFunction(
  {
    id: "send-password-reset",
    name: "Send password reset email",
    retries: 3,
    triggers: [{ event: EVENTS.SEND_PASSWORD_RESET }],
    onFailure: makeOnFailure("send-password-reset"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: unknown };
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    const parsed = passwordResetSchema.safeParse(event.data);
    if (!parsed.success) {
      console.error("[send-password-reset] Invalid payload:", parsed.error.flatten());
      return { ok: false, error: "INVALID_PAYLOAD", issues: parsed.error.flatten() };
    }
    const { to, firstName, resetUrl } = parsed.data;
    await step.run("send-email", async () => {
      await sendPasswordResetEmail({ to, firstName, resetUrl });
    });
    return { ok: true, to };
  },
);
