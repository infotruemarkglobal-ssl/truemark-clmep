/**
 * Instalment charge collection — Paystack has no recurring/BNPL billing
 * product, so this cron IS the recurring-billing system: it finds every
 * InstalmentCharge that's due, charges the stored reusable authorization via
 * POST /transaction/charge_authorization (see src/lib/paystack.ts), and
 * handles retry/dunning itself since Paystack will not retry a failed charge
 * on its own.
 *
 * Retry policy: up to MAX_ATTEMPTS total tries per charge, 2 days apart. On
 * the final failed attempt the charge is marked FAILED and the whole plan
 * DEFAULTED — course access is never revoked here (that's a business-policy
 * decision this cron doesn't make); staff and the candidate are notified so
 * a human can follow up.
 */

import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { paystackChargeAuthorization, toSmallestUnit } from "@/lib/paystack";
import { inngest } from "@/inngest/client";
import { auditLog } from "@/lib/audit";
import {
  sendInstalmentChargeSuccessEmail,
  sendInstalmentChargeFailedEmail,
  sendInstalmentPlanDefaultedEmail,
} from "@/lib/email";

const MAX_ATTEMPTS = 3;
const RETRY_DAYS = 2;

export const instalmentCharges = inngest.createFunction(
  {
    id: "instalment-charges",
    name: "Collect due instalment payments",
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
        tags: { inngest_function: "instalment-charges" },
        extra: { event },
      });
      console.error("[inngest:instalment-charges] All retries exhausted.", error);
    },
  },
  async ({ step }: { step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const due = await step.run("find-due-charges", () =>
      db.instalmentCharge.findMany({
        where: { status: { in: ["SCHEDULED", "RETRYING"] }, dueDate: { lte: new Date() } },
        include: { plan: { include: { purchase: true } } },
      }),
    );

    let charged = 0;
    let retried = 0;
    let defaulted = 0;

    for (const charge of due) {
      const result = await step.run(`charge-${charge.id}`, async () => {
        const { plan } = charge;
        const { purchase } = plan;
        if (!purchase.paystackAuthorizationCode || !purchase.userId) {
          // NEEDS_MANUAL_PAYMENT plans have no reusable authorization — their
          // charges should never have been left SCHEDULED, but guard anyway.
          return "skipped" as const;
        }

        // Purchase has no direct `user`/`course` relation (plain scalar FKs,
        // same as the webhook route) — fetch separately.
        const [user, course] = await Promise.all([
          db.user.findUnique({ where: { id: purchase.userId }, select: { id: true, email: true, firstName: true } }),
          purchase.courseId ? db.course.findUnique({ where: { id: purchase.courseId }, select: { title: true } }) : Promise.resolve(null),
        ]);
        if (!user) return "skipped" as const;

        const reference = `CLMEP-INST-${charge.id}-${Date.now()}`;
        const res = await paystackChargeAuthorization({
          email: user.email,
          amount: toSmallestUnit(charge.amount, purchase.currency),
          currency: purchase.currency,
          authorization_code: purchase.paystackAuthorizationCode,
          reference,
          metadata: { purchaseId: purchase.id, planId: plan.id, instalmentNumber: charge.instalmentNumber },
        });

        // res.data can be entirely absent (validation/auth-level errors from
        // Paystack carry no data object at all) — confirmed against the
        // real API, not a hypothetical. Never assume it's present.
        const succeeded = res.status && res.data?.status === "success";

        if (succeeded) {
          await db.instalmentCharge.update({
            where: { id: charge.id },
            data: { status: "PAID", paidAt: new Date(), paystackReference: reference, lastError: null },
          });

          const remainingBalance = await db.instalmentCharge.aggregate({
            where: { planId: plan.id, status: { in: ["SCHEDULED", "RETRYING"] } },
            _sum: { amount: true },
          });
          const stillOutstanding = (remainingBalance._sum.amount ?? 0) > 0;
          if (!stillOutstanding) {
            await db.instalmentPlan.update({ where: { id: plan.id }, data: { status: "COMPLETED" } });
          }

          await sendInstalmentChargeSuccessEmail({
            to: user.email,
            firstName: user.firstName,
            courseTitle: course?.title ?? "your course",
            instalmentNumber: charge.instalmentNumber,
            numberOfInstalments: plan.numberOfInstalments,
            amount: charge.amount,
            currency: purchase.currency,
            remainingBalance: remainingBalance._sum.amount ?? 0,
          }).catch((err) => console.error("[instalment-charges] success email failed:", err));

          return "charged" as const;
        }

        // ── Failed charge — retry or default ──────────────────────────────
        const attempts = charge.attempts + 1;
        const errorMessage = res.data?.gateway_response ?? res.message ?? "Charge declined";

        if (attempts < MAX_ATTEMPTS) {
          const nextRetry = new Date(Date.now() + RETRY_DAYS * 24 * 60 * 60 * 1000);
          await db.instalmentCharge.update({
            where: { id: charge.id },
            data: { status: "RETRYING", attempts, dueDate: nextRetry, lastError: errorMessage },
          });

          await sendInstalmentChargeFailedEmail({
            to: user.email,
            firstName: user.firstName,
            courseTitle: course?.title ?? "your course",
            instalmentNumber: charge.instalmentNumber,
            numberOfInstalments: plan.numberOfInstalments,
            amount: charge.amount,
            currency: purchase.currency,
            retryDate: nextRetry,
            attemptsRemaining: MAX_ATTEMPTS - attempts,
          }).catch((err) => console.error("[instalment-charges] retry email failed:", err));

          return "retrying" as const;
        }

        await db.$transaction([
          db.instalmentCharge.update({
            where: { id: charge.id },
            data: { status: "FAILED", attempts, lastError: errorMessage },
          }),
          db.instalmentPlan.update({ where: { id: plan.id }, data: { status: "DEFAULTED" } }),
        ]);

        await auditLog({
          userId: user.id,
          action: "INSTALMENT_PLAN_DEFAULTED",
          entityType: "InstalmentPlan",
          entityId: plan.id,
          metadata: {
            purchaseId: purchase.id,
            instalmentNumber: charge.instalmentNumber,
            amount: charge.amount,
            attempts,
            lastError: errorMessage,
          },
        }).catch(() => {});

        await sendInstalmentPlanDefaultedEmail({
          to: user.email,
          firstName: user.firstName,
          courseTitle: course?.title ?? "your course",
          instalmentNumber: charge.instalmentNumber,
          numberOfInstalments: plan.numberOfInstalments,
          amount: charge.amount,
          currency: purchase.currency,
        }).catch((err) => console.error("[instalment-charges] defaulted email failed:", err));

        return "defaulted" as const;
      });

      if (result === "charged") charged++;
      else if (result === "retrying") retried++;
      else if (result === "defaulted") defaulted++;
    }

    return { ok: true, due: due.length, charged, retried, defaulted };
  },
);
