/**
 * Quarterly security-review freshness check — ISO 27001 A.5.36/A.8.8.
 *
 * "A regular penetration-testing cadence, not a one-time review" is only
 * true if something actually enforces the cadence. This cron checks the
 * latest version of the "Security Review & Vulnerability Management Log"
 * Document (created via scripts/generate-security-policy-docs.ts, updated
 * whenever a new dated review is performed and registered as a new version
 * of the same Document) — if it's missing or more than 100 days old (a
 * quarter plus slack), it notifies every SUPER_ADMIN so the next review
 * actually gets scheduled rather than silently lapsing.
 *
 * IDEMPOTENCY
 * ───────────
 * notification.createMany uses skipDuplicates. Runs daily but only fires a
 * real notification on the day the log actually goes stale — re-running
 * before or after that produces no duplicate alerts because the log's
 * freshness (not the cron's own history) is what's checked each time.
 */

import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

const REVIEW_DOC_TITLE = "Security Review & Vulnerability Management Log";
const STALE_AFTER_DAYS = 100;

export const securityReviewCadence = inngest.createFunction(
  {
    id: "security-review-cadence",
    name: "Security review cadence reminder",
    retries: 3,
    triggers: [{ cron: "0 9 * * *" }],
    onFailure: async ({ error }: { event: unknown; error: Error }) => {
      Sentry.captureException(error, { tags: { inngest_function: "security-review-cadence" } });
      console.error("[inngest:security-review-cadence] All retries exhausted.", error);
    },
  },
  async ({ step }: { step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const result = await step.run("check-review-freshness", async () => {
      const doc = await db.document.findFirst({
        where: { title: REVIEW_DOC_TITLE, type: "report" },
        include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
      });

      const latest = doc?.versions[0];
      const ageDays = latest
        ? Math.floor((Date.now() - latest.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      if (latest && ageDays !== null && ageDays < STALE_AFTER_DAYS) {
        return { notified: false, reason: "review is current", ageDays };
      }

      const admins = await db.user.findMany({
        where: { role: USER_ROLES.SUPER_ADMIN, status: "ACTIVE" },
        select: { id: true },
      });

      if (admins.length > 0) {
        await db.notification.createMany({
          data: admins.map((a) => ({
            userId: a.id,
            type: "SYSTEM_ALERT",
            title: latest ? "Security review is overdue" : "No security review on record",
            message: latest
              ? `The last security review is ${ageDays} days old (quarterly cadence: ${STALE_AFTER_DAYS} days). Schedule the next internal review and log it in the Document Library.`
              : `No "${REVIEW_DOC_TITLE}" record exists yet. Perform and log an internal security review in the Document Library.`,
            link: "/documents?type=report",
          })),
          skipDuplicates: true,
        });
      }

      await auditLog({
        // AuditLog.userId has a real FK to User — "system" is not a real user
        // id and silently fails the write (auditLog() is best-effort/caught).
        // null is the schema-supported way to record a system-initiated event.
        userId: null,
        action: "SECURITY_REVIEW_CADENCE_REMINDER_SENT",
        entityType: "Document",
        entityId: doc?.id,
        metadata: { ageDays, adminCount: admins.length },
      });

      return { notified: true, ageDays, adminCount: admins.length };
    });

    return result;
  },
);
