/**
 * GDPR Art. 33 — 48-hour DPA notification reminder
 *
 * Fired when a breach incident is created. Sleeps until 48 hours after
 * discovery (leaving 24 hours before the 72-hour supervisory-authority
 * notification deadline), then checks whether reportedToAuthority is still
 * false. If so, it:
 *   1. Creates an in-app SYSTEM_ALERT for every active SUPER_ADMIN.
 *   2. Emails every SUPER_ADMIN + the address in GDPR_DPO_EMAIL (if set).
 *   3. Writes an audit log entry so there is a compliance record.
 *
 * IDEMPOTENCY
 * ───────────
 * Each step is labelled so Inngest memoises completed steps across retries.
 * The notification.createMany uses skipDuplicates so a double-fire cannot
 * produce duplicate in-app alerts.
 *
 * If the breach IS reported before the 48-hour mark the function wakes,
 * sees reportedToAuthority === true, and exits cleanly — no notification sent.
 */

import * as Sentry from "@sentry/nextjs";
import { inngest, EVENTS } from "@/inngest/client";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { sendBreachReminderEmail } from "@/lib/email";
import { addHours } from "date-fns";
import { USER_ROLES } from "@/lib/constants";

const DPA_WINDOW_HOURS = 72;
const REMINDER_AFTER_HOURS = 48;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

export const breachDpaReminder = inngest.createFunction(
  {
    id: "breach-dpa-reminder",
    name: "GDPR Art. 33 DPA notification reminder (48 h)",
    retries: 3,
    triggers: [{ event: EVENTS.BREACH_REPORTED }],
    onFailure: async ({ error }: { event: unknown; error: Error }) => {
      Sentry.captureException(error, {
        tags: { inngest_function: "breach-dpa-reminder" },
      });
      console.error("[inngest:breach-dpa-reminder] All retries exhausted.", error);
    },
  },
  async ({
    event,
    step,
  }: {
    event: { data: { breachId: string; discoveredAt: string } };
    step: {
      sleepUntil: (id: string, until: Date | string) => Promise<void>;
      run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
    };
  }) => {
    const { breachId, discoveredAt } = event.data;
    const reminderAt = addHours(new Date(discoveredAt), REMINDER_AFTER_HOURS);

    // ── Step 1: Sleep until 48 hours after breach discovery ──────────────────
    // step.sleepUntil is memoised — if this step already completed on a retry
    // the wait is skipped and execution continues immediately.
    await step.sleepUntil("wait-for-48h-mark", reminderAt);

    // ── Step 2: Check current report status ───────────────────────────────────
    const breach = await step.run("check-reported-status", async () => {
      return db.breachIncident.findUnique({
        where: { id: breachId },
        select: {
          id: true,
          title: true,
          severity: true,
          reportedToAuthority: true,
          discoveredAt: true,
        },
      });
    });

    if (!breach) return { skipped: true, reason: "breach_not_found" };
    if (breach.reportedToAuthority) return { skipped: true, reason: "already_reported" };

    const dpaDeadline = addHours(new Date(breach.discoveredAt), DPA_WINDOW_HOURS);
    const hoursRemaining = Math.max(
      0,
      Math.round((dpaDeadline.getTime() - Date.now()) / (1000 * 60 * 60)),
    );

    // ── Step 3: Fetch admins to notify ────────────────────────────────────────
    const admins = await step.run("fetch-admins", async () => {
      return db.user.findMany({
        where: { role: USER_ROLES.SUPER_ADMIN, status: "ACTIVE" },
        select: { id: true, email: true, firstName: true },
      });
    });

    // ── Step 4: Send in-app notifications + emails + audit log ────────────────
    await step.run("send-reminder-notifications", async () => {
      // In-app alerts — skipDuplicates guards against double-fire
      if (admins.length > 0) {
        await db.notification.createMany({
          data: admins.map((a) => ({
            userId: a.id,
            type: "SYSTEM_ALERT",
            title: `ART. 33 REMINDER: ~${hoursRemaining}h left to notify DPA`,
            message:
              `Breach "${breach.title}" (${breach.severity.toUpperCase()}) has NOT been ` +
              `reported to the supervisory authority. The 72-hour GDPR Art. 33 deadline ` +
              `expires at ${dpaDeadline.toLocaleString()}. Immediate action required.`,
            link: `/manage/gdpr/breaches/${breachId}`,
          })),
          skipDuplicates: true,
        });
      }

      // Email every SUPER_ADMIN + DPO
      const dpoEmail = process.env.GDPR_DPO_EMAIL;
      const emailRecipients = [
        ...admins.map((a) => ({ email: a.email, firstName: a.firstName })),
        ...(dpoEmail ? [{ email: dpoEmail, firstName: "DPO" }] : []),
      ];

      await Promise.allSettled(
        emailRecipients.map((r) =>
          sendBreachReminderEmail({
            to: r.email,
            firstName: r.firstName,
            breachTitle: breach.title,
            severity: breach.severity,
            dpaDeadline,
            hoursRemaining,
            breachUrl: `${APP_URL}/manage/gdpr/breaches/${breachId}`,
          }).catch((err) => {
            Sentry.captureException(err, {
              tags: { inngest_function: "breach-dpa-reminder" },
              extra: { recipient: r.email, breachId },
            });
            console.error(`[breach-dpa-reminder] Failed to email ${r.email}:`, err);
          }),
        ),
      );

      await auditLog({
        userId: "system",
        action: "BREACH_DPA_REMINDER_SENT",
        entityType: "BreachIncident",
        entityId: breachId,
        metadata: {
          hoursRemaining,
          dpaDeadline: dpaDeadline.toISOString(),
          adminCount: admins.length,
          dpoNotified: !!dpoEmail,
        },
      });
    });

    return { ok: true, breachId, hoursRemaining };
  },
);
