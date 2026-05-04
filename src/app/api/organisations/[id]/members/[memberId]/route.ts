import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.ORG_MANAGER];

async function checkAccess(userId: string, role: string, orgId: string) {
  if (!(ALLOWED as string[]).includes(role)) return false;
  if (role === USER_ROLES.ORG_MANAGER) {
    const m = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId: orgId } },
    });
    return !!m;
  }
  return true;
}

// PATCH /api/organisations/[id]/members/[memberId] — update member role/dept or send reminder
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, memberId } = await params;
  if (!(await checkAccess(session.user.id, session.user.role, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schema = z.object({
    role: z.string().optional(),
    departmentId: z.string().optional().nullable(),
    sendReminder: z.boolean().optional(), // trigger a reminder notification
    reminderCourseId: z.string().optional(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { sendReminder, reminderCourseId, ...updateFields } = body.data;

  const member = await db.organisationMember.findFirst({
    where: { id: memberId, organisationId: id },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Update member fields
  const cleanFields: Record<string, unknown> = {};
  if (updateFields.role !== undefined) cleanFields.role = updateFields.role;
  if (updateFields.departmentId !== undefined) cleanFields.departmentId = updateFields.departmentId;

  let updated = member;
  if (Object.keys(cleanFields).length > 0) {
    updated = await db.organisationMember.update({
      where: { id: memberId },
      data: cleanFields as Parameters<typeof db.organisationMember.update>[0]["data"],
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  // Send course reminder notification
  if (sendReminder && reminderCourseId) {
    const course = await db.course.findUnique({ where: { id: reminderCourseId }, select: { title: true } });
    const enrolment = await db.enrolment.findUnique({
      where: { userId_courseId: { userId: member.user.id, courseId: reminderCourseId } },
    });

    if (course) {
      const notifType = !enrolment ? "ENROLMENT_CONFIRMATION" : "CPD_REMINDER";
      const message = !enrolment
        ? `You have been assigned to the course "${course.title}". Please enrol to get started.`
        : `Reminder: You still have ${Math.round(100 - (enrolment.progress))}% left to complete in "${course.title}". Keep going!`;

      await db.notification.create({
        data: {
          userId: member.user.id,
          type: notifType,
          title: `Course Reminder: ${course.title}`,
          message,
          link: `/courses`,
        },
      });

      await auditLog({
        userId: session.user.id,
        action: "MEMBER_REMINDER_SENT",
        entityType: "OrganisationMember",
        entityId: memberId,
        metadata: {
          orgId: id, memberEmail: member.user.email,
          courseId: reminderCourseId, courseTitle: course.title,
        },
      });
    }
  }

  return NextResponse.json(updated);
}

// DELETE /api/organisations/[id]/members/[memberId] — remove member
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, memberId } = await params;
  if (!(await checkAccess(session.user.id, session.user.role, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const member = await db.organisationMember.findFirst({
    where: { id: memberId, organisationId: id },
    include: { user: { select: { email: true } } },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await db.organisationMember.delete({ where: { id: memberId } });

  await auditLog({
    userId: session.user.id,
    action: "ORG_MEMBER_REMOVED",
    entityType: "OrganisationMember",
    entityId: memberId,
    metadata: { orgId: id, memberEmail: member.user.email },
  });

  return NextResponse.json({ ok: true });
}
