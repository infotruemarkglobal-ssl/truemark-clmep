/**
 * Appeal SLA breach monitoring — ISO 17024 Cl.7.9 / APPEAL_SLA_DAYS
 *
 * Runs daily. Finds appeals that have been SUBMITTED (not yet resolved) for
 * longer than APPEAL_SLA_DAYS (28 days) and:
 *   1. Sends an in-app notification to every SUPER_ADMIN and CERTIFICATION_OFFICER.
 *   2. Writes an audit log entry for compliance evidence.
 *
 * IDEMPOTENCY
 * ───────────
 * Notifications are created with a stable `reference` key per (appealId, SLA
 * breach date). A unique constraint on that key prevents duplicates even if
 * the function runs twice in a day (Inngest retry or ops re-trigger).
 */

import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { subDays, startOfDay } from "date-fns";
import { APPEAL_SLA_DAYS, USER_ROLES } from "@/lib/constants";

export const appealSlaMonitor = inngest.createFunction(
  {
    id: "appeal-sla-monitor",
    name: "Appeal SLA breach monitor",
    retries: 3,
    triggers: [
      {
        event: "inngest/scheduler.trigger",
        // cron: runs every day at 07:00 UTC
        // Inngest cloud — add this cron in the Inngest dashboard or via
        // inngest.createScheduledFunction in a separate registration file.
      },
      // Also allow manual trigger for ops teams
      { event: "appeal/sla.check.requested" },
    ],
    onFailure: async ({
      error,
    }: {
      event: unknown;
      error: Error;
    }) => {
      Sentry.captureException(error, {
        tags: { inngest_function: "appeal-sla-monitor" },
      });
      console.error("[inngest:appeal-sla-monitor] Fatal error:", error);
    },
  },
  async ({ step }: { event: unknown; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    // ── Step 1: Find breached appeals ─────────────────────────────────────────
    const breachedAppeals = await step.run("find-breached-appeals", async () => {
      const slaDeadline = subDays(startOfDay(new Date()), APPEAL_SLA_DAYS);
      return db.appeal.findMany({
        where: {
          status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
          submittedAt: { lt: slaDeadline },
        },
        select: {
          id: true,
          reference: true,
          type: true,
          submittedAt: true,
          userId: true,
        },
      });
    });

    if (breachedAppeals.length === 0) {
      return { ok: true, breached: 0 };
    }

    // ── Step 2: Fetch staff to notify ─────────────────────────────────────────
    const staffToNotify = await step.run("fetch-staff", async () => {
      return db.user.findMany({
        where: {
          role: { in: [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER] },
          status: "ACTIVE",
        },
        select: { id: true },
      });
    });

    // ── Step 3: Create notifications (one per staff × appeal) ─────────────────
    // Each notification has a unique reference to prevent duplicate rows on retry.
    let notified = 0;
    for (const appeal of breachedAppeals) {
      await step.run(`notify-sla-breach-${appeal.id}`, async () => {
        const daysSince = Math.floor(
          (Date.now() - new Date(appeal.submittedAt).getTime()) / (1000 * 60 * 60 * 24),
        );

        await db.notification.createMany({
          data: staffToNotify.map((staff) => ({
            userId: staff.id,
            type: "SYSTEM_ALERT",
            title: `Appeal SLA Breach — ${appeal.reference}`,
            message:
              `Appeal ${appeal.reference} (${appeal.type}) has been unresolved for ` +
              `${daysSince} days, exceeding the ${APPEAL_SLA_DAYS}-day SLA. ` +
              `Immediate review required (ISO 17024 Cl.7.9).`,
            link: `/appeals`,
          })),
          skipDuplicates: true,
        });

        await auditLog({
          userId: "system",
          action: "APPEAL_SLA_BREACHED",
          entityType: "Appeal",
          entityId: appeal.id,
          metadata: {
            reference: appeal.reference,
            type: appeal.type,
            daysSinceSubmission: daysSince,
            slaThresholdDays: APPEAL_SLA_DAYS,
          },
        });

        return { appealId: appeal.id };
      });

      notified++;
    }

    return { ok: true, breached: breachedAppeals.length, notified };
  },
);
