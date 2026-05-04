import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { withOrgContext } from "@/lib/rls";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.ORG_MANAGER];

const schema = z.object({
  courseId: z.string(),
  userIds: z.array(z.string()).min(1, "Select at least one member"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: orgId } = await params;

  // ORG_MANAGER must belong to this org
  if (session.user.role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: session.user.id, organisationId: orgId } },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // Verify course exists and is published
  const course = await db.course.findUnique({
    where: { id: body.data.courseId, status: "PUBLISHED" },
  });
  if (!course) return NextResponse.json({ error: "Course not found or not published" }, { status: 404 });

  if (course.price > 0) {
    return NextResponse.json(
      { error: "This course requires payment. Complete payment before assigning to members." },
      { status: 402 },
    );
  }

  // Verify all users are members of this org
  const memberships = await db.organisationMember.findMany({
    where: { organisationId: orgId, userId: { in: body.data.userIds } },
    select: { userId: true },
  });
  const validUserIds = memberships.map((m) => m.userId);
  if (validUserIds.length === 0) {
    return NextResponse.json({ error: "No valid org members found" }, { status: 400 });
  }

  // Create enrolments - skip users already enrolled
  const existing = await db.enrolment.findMany({
    where: { courseId: body.data.courseId, userId: { in: validUserIds } },
    select: { userId: true },
  });
  const alreadyEnrolled = new Set(existing.map((e) => e.userId));
  const toEnrol = validUserIds.filter((uid) => !alreadyEnrolled.has(uid));

  if (toEnrol.length === 0) {
    return NextResponse.json({ message: "All selected members are already enrolled", enrolled: 0 });
  }

  // All enrolments in one transaction with the RLS org context set.
  // Every write inside this block is automatically scoped to orgId by the
  // database — a bug that passes the wrong org cannot leak data.
  await withOrgContext(db, orgId, async (tx) => {
    for (const userId of toEnrol) {
      await tx.enrolment.create({
        data: {
          userId,
          courseId: body.data.courseId,
          status: "ACTIVE",
          organisationId: orgId,
          registrationSource: "ORG_ASSIGNED",
        },
      });

      // Stamp the candidate's profile as ORG_SPONSORED. If they were previously
      // INDIVIDUAL or ORG_SELF_ENROL, the org is now the primary sponsor.
      await tx.candidateProfile.upsert({
        where: { userId },
        create: { userId, registrationType: "ORG_SPONSORED", sponsoringOrgId: orgId },
        update: { registrationType: "ORG_SPONSORED", sponsoringOrgId: orgId },
      });
    }
  });

  // Notifications are best-effort: one bulk insert instead of N round-trips.
  await db.notification.createMany({
    data: toEnrol.map((userId) => ({
      userId,
      type: "ENROLMENT_CONFIRMATION",
      title: "Course assigned to you",
      message: `Your organisation has enrolled you in "${course.title}". You can start learning immediately.`,
      link: `/courses/${course.slug}`,
    })),
  }).catch(() => {});

  await auditLog({
    userId: session.user.id,
    action: "ORG_COURSE_ASSIGNED",
    entityType: "Organisation",
    entityId: orgId,
    metadata: { courseId: body.data.courseId, courseTitle: course.title, enrolled: toEnrol.length },
  });

  return NextResponse.json({
    enrolled: toEnrol.length,
    skipped: alreadyEnrolled.size,
    message: `${toEnrol.length} member${toEnrol.length !== 1 ? "s" : ""} enrolled${alreadyEnrolled.size > 0 ? `, ${alreadyEnrolled.size} already enrolled` : ""}`,
  });
}
