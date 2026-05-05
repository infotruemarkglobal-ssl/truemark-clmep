import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";

const schema = z.object({
  seatId: z.string().min(1),
  userId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.ORG_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { seatId, userId } = body.data;

  // Load seat and verify manager belongs to the same org
  const seat = await db.courseSeat.findUnique({
    where: { id: seatId },
    include: { course: { select: { id: true, title: true, slug: true } } },
  });
  if (!seat) return NextResponse.json({ error: "Seat pool not found" }, { status: 404 });

  const managerMembership = await db.organisationMember.findFirst({
    where: { userId: session.user.id, organisationId: seat.organisationId },
  });
  if (!managerMembership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Check capacity
  if (seat.usedSeats >= seat.totalSeats) {
    return NextResponse.json({ error: "No seats remaining in this pool" }, { status: 409 });
  }

  // Verify target user is a member of the same org
  const targetMembership = await db.organisationMember.findFirst({
    where: { userId, organisationId: seat.organisationId },
    include: { user: { select: { email: true, firstName: true, lastName: true } } },
  });
  if (!targetMembership) {
    return NextResponse.json({ error: "User is not a member of this organisation" }, { status: 404 });
  }

  // Prevent double-assignment from this seat pool
  const existingAssignment = await db.seatAssignment.findUnique({
    where: { seatId_userId: { seatId, userId } },
  });
  if (existingAssignment) {
    return NextResponse.json({ error: "Seat already assigned to this user" }, { status: 409 });
  }

  // Prevent enrolment in same course if already enrolled
  const existingEnrolment = await db.enrolment.findUnique({
    where: { userId_courseId: { userId, courseId: seat.courseId } },
  });
  if (existingEnrolment) {
    return NextResponse.json({ error: "User is already enrolled in this course" }, { status: 409 });
  }

  // Create enrolment + seat assignment atomically
  const enrolment = await db.enrolment.create({
    data: {
      userId,
      courseId: seat.courseId,
      purchaseId: seat.purchaseId,
      status: "ACTIVE",
      progress: 0,
      organisationId: seat.organisationId,
      registrationSource: "ORG_ASSIGNED",
    },
  });

  await db.seatAssignment.create({
    data: {
      seatId,
      userId,
      assignedById: session.user.id,
      enrolmentId: enrolment.id,
    },
  });

  await db.courseSeat.update({
    where: { id: seatId },
    data: { usedSeats: { increment: 1 } },
  });

  // In-app notification for the assigned member
  await db.notification.create({
    data: {
      userId,
      type: "ENROLMENT_CONFIRMATION",
      title: "You've been enrolled in a course",
      message: `Your organisation has enrolled you in "${seat.course.title}". Start learning whenever you're ready.`,
      link: `/courses/${seat.course.slug}`,
    },
  }).catch(() => {});

  // Email via Inngest
  const assignee = targetMembership.user;
  await inngest.send({
    id: `seat-assigned-${seatId}-${userId}`,
    name: EVENTS.SEND_SEAT_ASSIGNED,
    data: {
      to: assignee.email,
      firstName: assignee.firstName,
      courseTitle: seat.course.title,
      courseSlug: seat.course.slug,
      orgName: seat.organisationId,
      userId,
    },
  }).catch((err) => console.error("[seats/assign] inngest send failed:", err));

  await auditLog({
    userId: session.user.id,
    action: "SEAT_ASSIGNED",
    entityType: "SeatAssignment",
    entityId: enrolment.id,
    metadata: { seatId, assignedTo: userId, courseId: seat.courseId, orgId: seat.organisationId },
  });

  return NextResponse.json({ ok: true, enrolmentId: enrolment.id }, { status: 201 });
}
