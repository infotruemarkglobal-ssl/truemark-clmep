/**
 * CPD shortfall reminders — nudge candidates whose logged CPD hours won't
 * meet their scheme's renewal requirement before their certificate expires.
 *
 * Mirrors certExpiry.ts's structure and idempotency pattern exactly (see
 * that file's header comment for the full rationale): a NotificationLog
 * check keyed by (userId, subject, sentAt >= start-of-today) before each
 * send, individual failures caught and Sentry-reported without aborting the
 * batch, onFailure pages Sentry once retries are exhausted.
 *
 * Only fires for schemes with renewalRequiresCPD: true, and only for
 * candidates who actually have a shortfall (hoursLogged < hoursRequired) —
 * no point nagging someone who's already met the requirement. The
 * "hours logged since last renewal" computation mirrors the same aggregate
 * already used at renewal time in
 * src/app/api/certificates/[id]/renew/route.ts:56-66.
 */

import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendCpdShortfallReminderEmail } from "@/lib/email";
import { RENEWAL_WARNINGS_DAYS } from "@/lib/constants";
import { addDays, startOfDay, endOfDay } from "date-fns";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

function subjectKey(certId: string, days: number) {
  return `CPD_SHORTFALL_WARNING_${days}d:${certId}`;
}

export const cpdShortfallReminders = inngest.createFunction(
  {
    id: "cpd-shortfall-reminders",
    name: "CPD shortfall reminders (180 / 90 / 30 days before renewal)",
    retries: 3,
    triggers: [{ cron: "30 7 * * *" }], // offset 30 min from cert-expiry-warnings to avoid contending for the same DB connections
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: unknown; name: string };
      error: Error;
    }) => {
      Sentry.captureException(error, {
        tags: { inngest_function: "cpd-shortfall-reminders" },
        extra: { event },
      });
      console.error(
        "[inngest:cpd-shortfall-reminders] All retries exhausted.",
        error,
      );
    },
  },
  async ({ step }: { step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    let totalSent = 0;
    let totalSkipped = 0;

    for (const days of RENEWAL_WARNINGS_DAYS) {
      const result = await step.run(`send-${days}d-cpd-shortfall`, async () => {
        const stepNow = new Date();
        const targetDate = addDays(stepNow, days);
        const todayStart = startOfDay(stepNow);

        const certs = await db.certificate.findMany({
          where: {
            status: "ACTIVE",
            deletedAt: null,
            expiresAt: { gte: startOfDay(targetDate), lte: endOfDay(targetDate) },
            scheme: { renewalRequiresCPD: true },
          },
          include: {
            user: { select: { id: true, email: true, firstName: true, status: true } },
            scheme: { select: { id: true, name: true, cpdHoursRequired: true } },
            renewals: { orderBy: { renewedAt: "desc" }, take: 1 },
          },
        });

        let sent = 0;
        let skipped = 0;

        const activeCertUserIds = certs
          .filter((c) => c.user.status === "ACTIVE" && c.expiresAt)
          .map((c) => c.user.id);

        const consentRows = await db.consentRecord.findMany({
          where: { userId: { in: activeCertUserIds }, purpose: "MARKETING" },
          orderBy: { grantedAt: "desc" },
          select: { userId: true, granted: true, withdrawnAt: true },
        });
        const consentByUser = new Map<string, { granted: boolean; withdrawnAt: Date | null }>();
        for (const row of consentRows) {
          if (!consentByUser.has(row.userId)) {
            consentByUser.set(row.userId, { granted: row.granted, withdrawnAt: row.withdrawnAt });
          }
        }

        for (const cert of certs) {
          if (cert.user.status !== "ACTIVE") { skipped++; continue; }
          if (!cert.expiresAt) { skipped++; continue; }

          const latestConsent = consentByUser.get(cert.user.id);
          if (latestConsent && !latestConsent.granted && latestConsent.withdrawnAt) {
            skipped++;
            continue;
          }

          // Same window as the renewal eligibility check: hours logged since
          // the last renewal, or since issuance if never renewed.
          const cpdSince = cert.renewals[0]?.renewedAt ?? cert.issuedAt;
          const cpdResult = await db.cPDRecord.aggregate({
            where: { userId: cert.userId, schemeId: cert.schemeId, status: "approved", activityDate: { gte: cpdSince } },
            _sum: { hoursLogged: true },
          });
          const hoursLogged = cpdResult._sum.hoursLogged ?? 0;
          const hoursRequired = cert.scheme.cpdHoursRequired;

          if (hoursLogged >= hoursRequired) { skipped++; continue; }

          const key = subjectKey(cert.id, days);
          const alreadySent = await db.notificationLog.findFirst({
            where: { userId: cert.user.id, subject: key, sentAt: { gte: todayStart } },
            select: { id: true },
          });
          if (alreadySent) { skipped++; continue; }

          try {
            await sendCpdShortfallReminderEmail({
              to: cert.user.email,
              firstName: cert.user.firstName,
              certificateNumber: cert.certificateNumber,
              schemeName: cert.schemeNameSnapshot ?? cert.scheme?.name ?? "Unknown",
              expiresAt: cert.expiresAt,
              daysRemaining: days,
              hoursLogged,
              hoursRequired,
              cpdUrl: `${APP_URL}/cpd`,
              userId: cert.user.id,
            });

            await db.notificationLog.create({
              data: {
                userId: cert.user.id,
                channel: "email",
                recipient: cert.user.email,
                subject: key,
                body: `CPD shortfall warning: ${hoursLogged}/${hoursRequired} hours logged, ${days} days remaining for ${cert.certificateNumber}`,
                status: "sent",
                metadata: JSON.stringify({ certId: cert.id, days, hoursLogged, hoursRequired }),
              },
            });

            sent++;
          } catch (err) {
            Sentry.captureException(err, {
              tags: { inngest_function: "cpd-shortfall-reminders", days: String(days) },
              extra: { certId: cert.id, userId: cert.user.id, email: cert.user.email },
            });
            console.error(
              `[cpd-shortfall] Failed to send ${days}-day warning for cert ${cert.id}:`,
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
