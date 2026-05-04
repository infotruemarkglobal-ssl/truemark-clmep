/**
 * Orphaned exam attempt cleanup
 *
 * An attempt is "orphaned" when it is still IN_PROGRESS but the candidate's
 * exam duration (+ a 30-minute grace buffer) has elapsed with no heartbeat.
 * This happens when the browser crashes, the tab is closed without the
 * beforeunload beacon firing, or the network drops permanently.
 *
 * The function marks orphaned attempts CANCELLED (not VOIDED) so they do not
 * consume one of the candidate's retry quota — the failure was technical,
 * not a misconduct event.  A notification and audit log are written so the
 * candidate and staff can see what happened.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import * as Sentry from "@sentry/nextjs";

// Grace period beyond the exam duration after which we deem the attempt orphaned
const GRACE_MINUTES = 30;

export const orphanedAttemptCleanup = inngest.createFunction(
  {
    id: "orphaned-attempt-cleanup",
    name: "Orphaned exam attempt cleanup",
    retries: 3,
    triggers: [
      { event: "inngest/scheduler.trigger" },
      { event: "exam/orphan.cleanup.requested" },
    ],
    onFailure: async ({ error }: { event: unknown; error: Error }) => {
      Sentry.captureException(error, { tags: { inngest_function: "orphaned-attempt-cleanup" } });
      console.error("[inngest:orphaned-attempt-cleanup] Fatal error:", error);
    },
  },
  async ({ step }: { event: unknown; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const orphans = await step.run("find-orphaned-attempts", async () => {
      return db.examAttempt.findMany({
        where: {
          status: "IN_PROGRESS",
          deletedAt: null,
          startedAt: { not: null },
        },
        include: {
          examPaper: { select: { durationMins: true } },
          user: { select: { id: true, email: true, firstName: true } },
        },
      });
    });

    const now = Date.now();
    const cancelled: string[] = [];

    for (const attempt of orphans) {
      if (!attempt.startedAt) continue;
      const durationMins = attempt.examPaper.durationMins ?? 60;
      const deadlineMs = new Date(attempt.startedAt).getTime() + (durationMins + GRACE_MINUTES) * 60_000;
      if (now < deadlineMs) continue; // still within grace window

      await step.run(`cancel-orphan-${attempt.id}`, async () => {
        await db.$transaction([
          db.examAttempt.update({
            where: { id: attempt.id },
            data: { status: "CANCELLED", submittedAt: new Date() },
          }),
          db.proctoringSession.updateMany({
            where: { attemptId: attempt.id, status: "active" },
            data: { status: "ended", endedAt: new Date() },
          }),
        ]);

        await db.notification.create({
          data: {
            userId: attempt.user.id,
            type: "SYSTEM_ALERT",
            title: "Exam session expired",
            message:
              "Your exam session was automatically closed because the connection was lost. " +
              "This attempt has not been counted against your retry limit. Please contact support if you have questions.",
            link: "/exams",
          },
        }).catch(() => {});

        await auditLog({
          userId: "system",
          action: "EXAM_ATTEMPT_ORPHAN_CANCELLED",
          entityType: "ExamAttempt",
          entityId: attempt.id,
          metadata: {
            userId: attempt.user.id,
            durationMins,
            graceMins: GRACE_MINUTES,
            startedAt: attempt.startedAt,
          },
        });

        return attempt.id;
      });

      cancelled.push(attempt.id);
    }

    return { ok: true, found: orphans.length, cancelled: cancelled.length };
  },
);
