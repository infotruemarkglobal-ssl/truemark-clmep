/**
 * Risk-based surveillance scheduling between renewal cycles — ISO 17024
 * Cl.9.4. Distinct from certExpiry.ts (which reminds a candidate their OWN
 * certificate is expiring): this proactively selects certificate holders,
 * under schemes that opt in, for a between-cycle review of continued
 * competence/conduct — independent of whether their certificate is close to
 * expiring.
 *
 * IDEMPOTENCY
 * ───────────
 * A certificate with an existing SCHEDULED or IN_PROGRESS SurveillanceReview
 * is skipped outright — the domain model itself is the idempotency guard
 * (no separate NotificationLog entry needed, unlike an email-send cron).
 * Safe to re-run any number of times per day.
 *
 * RISK LEVEL
 * ──────────
 * A real (not fabricated) signal, not random sampling: HIGH if the holder
 * has any non-closed complaint or appeal on file; MEDIUM if they have an
 * active conflict-of-interest declaration naming them as the subject; LOW
 * otherwise. This reuses the Complaint/Appeal/COIDeclaration data already
 * real and populated elsewhere in the platform.
 */

import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { addMonths } from "date-fns";

export const surveillanceScheduling = inngest.createFunction(
  {
    id: "surveillance-scheduling",
    name: "Risk-based surveillance scheduling",
    retries: 3,
    triggers: [{ cron: "0 8 * * *" }],
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: unknown; name: string };
      error: Error;
    }) => {
      Sentry.captureException(error, {
        tags: { inngest_function: "surveillance-scheduling" },
        extra: { event },
      });
      console.error("[inngest:surveillance-scheduling] All retries exhausted.", error);
    },
  },
  async ({ step }: { step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const result = await step.run("schedule-due-reviews", async () => {
      const now = new Date();

      const schemes = await db.certificationScheme.findMany({
        where: { surveillanceRequired: true, surveillanceIntervalMonths: { not: null } },
        select: { id: true, surveillanceIntervalMonths: true },
      });
      if (schemes.length === 0) return { scheduled: 0, skipped: 0, schemesChecked: 0 };

      let scheduled = 0;
      let skipped = 0;

      for (const scheme of schemes) {
        const intervalMonths = scheme.surveillanceIntervalMonths!;

        const certs = await db.certificate.findMany({
          where: { schemeId: scheme.id, status: "ACTIVE", deletedAt: null },
          select: {
            id: true,
            userId: true,
            issuedAt: true,
            surveillanceReviews: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, completedAt: true } },
          },
        });

        for (const cert of certs) {
          const latest = cert.surveillanceReviews[0];
          if (latest && (latest.status === "SCHEDULED" || latest.status === "IN_PROGRESS")) {
            skipped++; // already has an open review — idempotency guard
            continue;
          }

          const cycleStart = latest?.completedAt ?? cert.issuedAt;
          const dueDate = addMonths(cycleStart, intervalMonths);
          if (now < dueDate) {
            skipped++; // not due yet
            continue;
          }

          const [openComplaint, openAppeal, activeCoi] = await Promise.all([
            db.complaint.findFirst({ where: { userId: cert.userId, status: { notIn: ["RESOLVED", "CLOSED"] } }, select: { id: true } }),
            db.appeal.findFirst({ where: { userId: cert.userId, status: { notIn: ["UPHELD", "REJECTED", "CLOSED"] } }, select: { id: true } }),
            db.cOIDeclaration.findFirst({ where: { subjectUserId: cert.userId, hasConflict: true, expiresAt: { gt: now } }, select: { id: true } }),
          ]);
          const riskLevel = openComplaint || openAppeal ? "HIGH" : activeCoi ? "MEDIUM" : "LOW";
          const reasonParts = [
            openComplaint && "open complaint on file",
            openAppeal && "open appeal on file",
            activeCoi && "active conflict-of-interest declaration naming this candidate",
          ].filter(Boolean);

          await db.surveillanceReview.create({
            data: {
              certificateId: cert.id,
              userId: cert.userId,
              riskLevel,
              reason: reasonParts.length ? reasonParts.join("; ") : "Routine risk-based surveillance per scheme interval",
              scheduledFor: now,
            },
          });
          scheduled++;
        }
      }

      return { scheduled, skipped, schemesChecked: schemes.length };
    });

    return result;
  },
);
