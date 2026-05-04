import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";
import { z } from "zod";

const schema = z.object({ courseId: z.string() });

// POST /api/enrolments — enrol in a course (free courses only for now)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { courseId } = body.data;

  const course = await db.course.findUnique({ where: { id: courseId, status: "PUBLISHED" } });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  if (course.price > 0) {
    return NextResponse.json(
      { error: "This course requires payment. Please complete checkout to enrol." },
      { status: 402 },
    );
  }

  // Check prerequisite courses
  if (course.prerequisiteCourseIds) {
    const prereqs: string[] = JSON.parse(course.prerequisiteCourseIds);
    if (prereqs.length > 0) {
      const completed = await db.enrolment.count({
        where: { userId: session.user.id, courseId: { in: prereqs }, status: "COMPLETED" },
      });
      if (completed < prereqs.length) {
        return NextResponse.json({ error: "Prerequisites not completed" }, { status: 400 });
      }
    }
  }

  const existing = await db.enrolment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId } },
  });
  if (existing) return NextResponse.json({ enrolment: existing });

  // Check if the candidate is an org member — if so, this is ORG_SELF_ENROL.
  const orgMembership = await db.organisationMember.findFirst({
    where: { userId: session.user.id },
    select: { organisationId: true },
  });

  const enrolment = await db.enrolment.create({
    data: {
      userId: session.user.id,
      courseId,
      status: "ACTIVE",
      registrationSource: "SELF",
      organisationId: orgMembership?.organisationId ?? null,
    },
  });

  // Keep CandidateProfile in sync — ORG_SELF_ENROL if in an org, else INDIVIDUAL.
  // update:{} is intentional: never downgrade an existing ORG_SPONSORED designation.
  if (orgMembership) {
    await db.candidateProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        registrationType: "ORG_SELF_ENROL",
        sponsoringOrgId: orgMembership.organisationId,
      },
      update: {},
    });
  } else {
    await db.candidateProfile.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, registrationType: "INDIVIDUAL" },
      update: {},
    });
  }

  await auditLog({
    userId: session.user.id,
    action: "COURSE_ENROLMENT",
    entityType: "Enrolment",
    entityId: enrolment.id,
    metadata: { courseId, courseTitle: course.title },
  });

  // Fire confirmation email. session.user doesn't carry email/firstName so we
  // fetch them here — the same pattern used in the Paystack webhook flow.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, firstName: true },
  });
  if (user) {
    await inngest.send({
      name: EVENTS.SEND_ENROLMENT_CONFIRM,
      data: {
        to: user.email,
        firstName: user.firstName,
        courseTitle: course.title,
        courseSlug: course.slug,
        userId: session.user.id,
      },
    }).catch((err) => console.error("[enrolments] Failed to enqueue confirmation email:", err));
  }

  return NextResponse.json({ enrolment }, { status: 201 });
}
