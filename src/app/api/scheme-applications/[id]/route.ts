import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

const OFFICER_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), notes: z.string().max(1000).optional() }),
  z.object({ action: z.literal("reject"), reason: z.string().min(1).max(1000) }),
]);

// PATCH /api/scheme-applications/[id] — CO approves or rejects an application
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(OFFICER_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const application = await db.schemeApplication.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      scheme: { select: { id: true, name: true, code: true } },
      course: { select: { id: true, title: true, slug: true } },
    },
  });

  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  if (application.status !== "PENDING") {
    return NextResponse.json(
      { error: `Application has already been ${application.status.toLowerCase()}.` },
      { status: 409 },
    );
  }

  const now = new Date();

  if (body.data.action === "approve") {
    // Check for existing enrolment (idempotent)
    const existingEnrolment = await db.enrolment.findUnique({
      where: {
        userId_courseId: {
          userId: application.userId,
          courseId: application.courseId,
        },
      },
      select: { id: true },
    });

    await db.$transaction([
      db.schemeApplication.update({
        where: { id: application.id },
        data: {
          status: "APPROVED",
          reviewedById: session.user.id,
          reviewedAt: now,
        },
      }),
      ...(existingEnrolment
        ? []
        : [
            db.enrolment.create({
              data: {
                userId: application.userId,
                courseId: application.courseId,
                applicationStatus: "APPROVED",
                applicationRef: `APP-${application.scheme.code}-${application.id.slice(-6).toUpperCase()}`,
              },
            }),
          ]),
    ]);

    // Notify candidate
    await db.notification.create({
      data: {
        userId: application.userId,
        type: "SYSTEM_ALERT",
        title: `Application Approved — ${application.scheme.name}`,
        message:
          `Your application for ${application.scheme.name} has been approved by a Certification Officer. ` +
          `You are now enrolled and may proceed with your course.`,
        link: `/courses/${application.course.slug}`,
      },
    }).catch(() => {});

    await auditLog({
      userId: session.user.id,
      action: "SCHEME_APPLICATION_APPROVED",
      entityType: "SchemeApplication",
      entityId: application.id,
      metadata: {
        schemeId: application.scheme.id,
        candidateId: application.userId,
        courseId: application.courseId,
      },
    });

    return NextResponse.json({ ok: true, status: "APPROVED" });
  }

  // Reject
  await db.schemeApplication.update({
    where: { id: application.id },
    data: {
      status: "REJECTED",
      rejectionReason: body.data.reason,
      reviewedById: session.user.id,
      reviewedAt: now,
    },
  });

  await db.notification.create({
    data: {
      userId: application.userId,
      type: "SYSTEM_ALERT",
      title: `Application Rejected — ${application.scheme.name}`,
      message:
        `Your application for ${application.scheme.name} was not approved. ` +
        `Reason: ${body.data.reason} You may reapply once you have addressed the requirements.`,
      link: `/courses/${application.course.slug}`,
    },
  }).catch(() => {});

  await auditLog({
    userId: session.user.id,
    action: "SCHEME_APPLICATION_REJECTED",
    entityType: "SchemeApplication",
    entityId: application.id,
    metadata: {
      schemeId: application.scheme.id,
      candidateId: application.userId,
      reason: body.data.reason,
    },
  });

  return NextResponse.json({ ok: true, status: "REJECTED" });
}
