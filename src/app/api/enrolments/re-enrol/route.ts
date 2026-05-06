import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";

// POST /api/enrolments/re-enrol — reset a free-course enrolment after exhausted attempts.
// Paid courses must go through the cart; this endpoint returns 402 for them.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.CANDIDATE)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let courseId: string;
  try {
    ({ courseId } = (await req.json()) as { courseId: string });
    if (!courseId) throw new Error();
  } catch {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, price: true },
  });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  // Paid courses must re-purchase through the cart flow.
  if (course.price > 0) {
    return NextResponse.json({ error: "Re-enrolment requires payment" }, { status: 402 });
  }

  const enrolment = await db.enrolment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId } },
    select: { id: true },
  });
  if (!enrolment)
    return NextResponse.json({ error: "No enrolment found" }, { status: 404 });

  await db.$transaction([
    db.enrolment.update({
      where: { id: enrolment.id },
      data: { progress: 0, completedAt: null, status: "ACTIVE", enroledAt: new Date() },
    }),
    db.lessonProgress.deleteMany({ where: { enrolmentId: enrolment.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
