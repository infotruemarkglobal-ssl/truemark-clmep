/**
 * Certificate expiry warning emails — ISO 17024 Cl.7.3/7.5
 *
 * IDEMPOTENCY
 * ───────────
 * Before sending each email we check NotificationLog for a record with the
 * same (userId, subject key, sentAt >= start-of-today). If found we skip.
 * After a successful send we write the record. This means:
 *   • Inngest retries that re-run this function on the same day are safe.
 *   • Manual re-triggers by ops staff are safe.
 *   • A partial failure mid-batch does NOT duplicate emails that already went.
 *
 * The idempotency check lives inside step.run() so Inngest's own memoisation
 * layer also guards against replaying a step that completed successfully.
 *
 * ON FAILURE
 * ──────────
 * Individual email failures are caught, reported to Sentry, and skipped so
 * one bad address cannot abort the entire batch. If the function itself throws
 * (e.g. DB unreachable) onFailure fires after all retries and pages Sentry.
 */

import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendCertificateExpiryWarningEmail } from "@/lib/email";
import { addDays, startOfDay, endOfDay } from "date-fns";

const WARNING_DAYS = [180, 90, 30] as const;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

// Stable subject key stored in NotificationLog — must not change between deploys
// or the idempotency guard will re-send on the next day's run.
function subjectKey(certId: string, days: number) {
  return `CERT_EXPIRY_WARNING_${days}d:${certId}`;
}

export const certExpiryWarnings = inngest.createFunction(
  {
    id: "cert-expiry-warnings",
    name: "Certificate expiry warnings (180 / 90 / 30 days)",
    retries: 3,
    triggers: [{ cron: "0 7 * * *" }],
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: unknown; name: string };
      error: Error;
    }) => {
      Sentry.captureException(error, {
        tags: { inngest_function: "cert-expiry-warnings" },
        extra: { event },
      });
      console.error(
        "[inngest:cert-expiry-warnings] All retries exhausted.",
        error,
      );
    },
  },
  async ({ step }: { step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    let totalSent = 0;
    let totalSkipped = 0;

    for (const days of WARNING_DAYS) {
      // step.run is memoised — if this step already completed on a prior
      // retry attempt, Inngest replays the result without re-executing.
      const result = await step.run(`send-${days}d-warnings`, async () => {
        // Capture time inside the step so retries that run on a different
        // calendar day use the correct date for both the cert window and
        // the idempotency guard (L3 fix — todayStart must not drift across days).
        const stepNow = new Date();
        const targetDate = addDays(stepNow, days);
        const todayStart = startOfDay(stepNow);

        const certs = await db.certificate.findMany({
          where: {
            status: "ACTIVE",
            deletedAt: null,
            expiresAt: {
              gte: startOfDay(targetDate),
              lte: endOfDay(targetDate),
            },
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                status: true,
              },
            },
            scheme: {
              select: { name: true },
            },
          },
        });

        let sent = 0;
        let skipped = 0;

        // Batch-fetch all MARKETING consent records for this set of users in one
        // query, then build a map for O(1) lookup. Eliminates the previous N+1
        // pattern (one DB round-trip per certificate in the batch).
        const activeCertUserIds = certs
          .filter((c) => c.user.status === "ACTIVE" && c.expiresAt)
          .map((c) => c.user.id);

        const consentRows = await db.consentRecord.findMany({
          where: { userId: { in: activeCertUserIds }, purpose: "MARKETING" },
          orderBy: { grantedAt: "desc" },
          select: { userId: true, granted: true, withdrawnAt: true },
        });

        // Keep only the most-recent consent row per user (rows are ordered desc).
        const consentByUser = new Map<string, { granted: boolean; withdrawnAt: Date | null }>();
        for (const row of consentRows) {
          if (!consentByUser.has(row.userId)) {
            consentByUser.set(row.userId, { granted: row.granted, withdrawnAt: row.withdrawnAt });
          }
        }

        for (const cert of certs) {
          if (cert.user.status !== "ACTIVE") { skipped++; continue; }
          if (!cert.expiresAt) { skipped++; continue; }

          // ── GDPR Art. 7(3) / CAN-SPAM §7 — honour explicit unsubscribe ────
          const latestConsent = consentByUser.get(cert.user.id);
          if (latestConsent && !latestConsent.granted && latestConsent.withdrawnAt) {
            skipped++;
            continue;
          }

          const key = subjectKey(cert.id, days);

          // ── Idempotency guard ──────────────────────────────────────────────
          // Check if we already sent this exact warning today. This guard
          // fires on Inngest retries, manual re-runs, and duplicate cron fires.
          const alreadySent = await db.notificationLog.findFirst({
            where: {
              userId: cert.user.id,
              subject: key,
              sentAt: { gte: todayStart },
            },
            select: { id: true },
          });
          if (alreadySent) { skipped++; continue; }

          try {
            await sendCertificateExpiryWarningEmail({
              to: cert.user.email,
              firstName: cert.user.firstName,
              certificateNumber: cert.certificateNumber,
              schemeName: cert.schemeNameSnapshot ?? cert.scheme?.name ?? "Unknown",
              expiresAt: cert.expiresAt,
              daysRemaining: days,
              renewalUrl: `${APP_URL}/certificates/${cert.id}/renew`,
              userId: cert.user.id,
            });

            // Record successful send — this is what future idempotency checks read.
            await db.notificationLog.create({
              data: {
                userId: cert.user.id,
                channel: "email",
                recipient: cert.user.email,
                subject: key,
                body: `Certificate expiry warning: ${days} days remaining for ${cert.certificateNumber}`,
                status: "sent",
                metadata: JSON.stringify({ certId: cert.id, days }),
              },
            });

            sent++;
          } catch (err) {
            // Capture per-email failures in Sentry but do NOT throw — a single
            // bad address must not abort the whole batch or trigger a retry
            // that would duplicate already-sent emails.
            Sentry.captureException(err, {
              tags: { inngest_function: "cert-expiry-warnings", days: String(days) },
              extra: { certId: cert.id, userId: cert.user.id, email: cert.user.email },
            });
            console.error(
              `[cert-expiry] Failed to send ${days}-day warning for cert ${cert.id}:`,
              err,
            );
            skipped++;
          }
        }

        return { sent, skipped };
      });

      totalSent += result.sent;
      totalSkipped += result.skipped;
    }

    return { ok: true, totalSent, totalSkipped };
  },
);
