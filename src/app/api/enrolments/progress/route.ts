import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  enrolmentId: z.string(),
  lessonId: z.string(),
  completed: z.boolean().optional(),
  timeSpentSecs: z.number().min(0).max(86400).optional(),
  lastPosition: z.number().min(0).max(86400).optional(),
});

// PATCH /api/enrolments/progress — update lesson progress
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const { enrolmentId, lessonId, completed, timeSpentSecs, lastPosition } = body.data;

  // Verify ownership
  const enrolment = await db.enrolment.findFirst({
    where: { id: enrolmentId, userId: session.user.id },
    include: { course: { include: { modules: { include: { lessons: true } } } } },
  });
  if (!enrolment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // C7: Verify the lessonId belongs to this enrolment's course.
  // Without this check a candidate could POST any lessonId and mark arbitrary
  // lessons as complete under their own enrolment record.
  const lessonBelongsToCourse = enrolment.course.modules
    .flatMap((m) => m.lessons)
    .some((l) => l.id === lessonId);
  if (!lessonBelongsToCourse) {
    return NextResponse.json({ error: "Lesson not found in this enrolment" }, { status: 403 });
  }

  // Upsert lesson progress
  const lessonProgress = await db.lessonProgress.upsert({
    where: { enrolmentId_lessonId: { enrolmentId, lessonId } },
    update: {
      ...(completed !== undefined ? { completed, completedAt: completed ? new Date() : null } : {}),
      ...(timeSpentSecs !== undefined ? { timeSpentSecs } : {}),
      ...(lastPosition !== undefined ? { lastPosition } : {}),
    },
    create: {
      enrolmentId,
      lessonId,
      completed: completed ?? false,
      completedAt: completed ? new Date() : null,
      timeSpentSecs: timeSpentSecs ?? 0,
      lastPosition: lastPosition ?? 0,
    },
  });

  // Recalculate overall course progress
  const allLessons = enrolment.course.modules.flatMap((m) => m.lessons);
  const completedLessons = await db.lessonProgress.count({
    where: { enrolmentId, completed: true },
  });
  const progressPct = allLessons.length > 0
    ? Math.round((completedLessons / allLessons.length) * 100)
    : 0;

  const updatedEnrolment = await db.enrolment.update({
    where: { id: enrolmentId },
    data: {
      progress: progressPct,
      ...(progressPct === 100 ? { status: "COMPLETED", completedAt: new Date() } : {}),
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "LESSON_PROGRESS_UPDATED",
    entityType: "LessonProgress",
    entityId: lessonProgress.id,
    metadata: {
      enrolmentId,
      lessonId,
      completed: completed ?? false,
      progressPct,
      severity: "LOW",
    },
  }).catch(() => {});

  return NextResponse.json({ lessonProgress, enrolment: updatedEnrolment });
}
