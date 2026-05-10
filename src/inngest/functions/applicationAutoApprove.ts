/**
 * Scheme Application Auto-Approval — ISO 17024 Cl.6.2
 *
 * Triggered by "application/auto-approve-check" with a scheduled ts so the
 * event is delivered after autoApproveMinutes. On delivery:
 *   1. Fetch the application — if already decided, return (idempotent).
 *   2. Auto-approve: set status to AUTO_APPROVED, create enrolment, notify.
 *
 * IDEMPOTENCY
 * ───────────
 * The status check in step "check-application" is the idempotency guard.
 * If Inngest retries the function, the re-fetched status will already be
 * AUTO_APPROVED (or APPROVED/REJECTED by a CO), and the function exits early.
 * The enrolment upsert is also guarded — if it already exists, the create is
 * skipped inside the transaction.
 */

import { inngest, EVENTS } from "@/inngest/client";
import { db } from "@/lib/db";

export const applicationAutoApprove = inngest.createFunction(
  {
    id: "application-auto-approve",
    name: "Scheme Application — Auto-approval",
    retries: 3,
    triggers: [{ event: EVENTS.APPLICATION_AUTO_APPROVE }],
  },
  async ({ event, step }: { event: { data: { applicationId: string; autoApproveMinutes: number } }; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { applicationId } = event.data;

    const application = await step.run("check-application", () =>
      db.schemeApplication.findUnique({
        where: { id: applicationId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          scheme: { select: { id: true, name: true, code: true } },
          course: { select: { id: true, slug: true } },
        },
      }),
    );

    // Idempotent: if already decided by CO (or already auto-approved), stop
    if (!application || application.status !== "PENDING") {
      return { ok: true, skipped: true, status: application?.status ?? "not_found" };
    }

    await step.run("auto-approve", async () => {
      const existingEnrolment = await db.enrolment.findUnique({
        where: {
          userId_courseId: {
            userId: application.userId,
            courseId: application.courseId,
          },
        },
        select: { id: true },
      });

      const now = new Date();
      const ref = `APP-${application.scheme.code}-${application.id.slice(-6).toUpperCase()}`;

      await db.$transaction([
        db.schemeApplication.update({
          where: { id: application.id },
          data: { status: "AUTO_APPROVED", autoApprovedAt: now },
        }),
        ...(existingEnrolment
          ? []
          : [
              db.enrolment.create({
                data: {
                  userId: application.userId,
                  courseId: application.courseId,
                  applicationStatus: "APPROVED",
                  applicationRef: ref,
                },
              }),
            ]),
      ]);
    });

    await step.run("notify-candidate", () =>
      db.notification
        .create({
          data: {
            userId: application.userId,
            type: "SYSTEM_ALERT",
            title: `Application Approved — ${application.scheme.name}`,
            message:
              `Your application for the ${application.scheme.name} scheme has been automatically approved. ` +
              `You are now enrolled and may proceed with your course.`,
            link: application.course?.slug ? `/courses/${application.course.slug}` : "/courses",
          },
        })
        .catch(() => undefined),
    );

    await step.run("notify-officers", async () => {
      const officers = await db.user.findMany({
        where: { role: { in: ["SUPER_ADMIN", "CERTIFICATION_OFFICER"] }, status: "ACTIVE" },
        select: { id: true },
      });
      if (officers.length === 0) return;
      await db.notification.createMany({
        data: officers.map((o) => ({
          userId: o.id,
          type: "SYSTEM_ALERT",
          title: `Auto-approved Application — ${application.scheme.name}`,
          message:
            `${application.user.firstName} ${application.user.lastName}'s application for ` +
            `${application.scheme.name} was automatically approved after the review window elapsed.`,
          link: `/manage/applications`,
        })),
        skipDuplicates: true,
      });
    });

    return { ok: true, applicationId };
  },
);
