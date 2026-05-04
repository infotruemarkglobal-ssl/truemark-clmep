import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];
const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

async function getLesson(id: string) {
  return db.courseLesson.findUnique({
    where: { id },
    include: { module: { include: { course: true } } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const lesson = await getLesson(id);
  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);
  if (!isAdmin && lesson.module.course.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schema = z.object({
    title: z.string().min(1).optional(),
    contentType: z.enum(["video", "pdf", "text", "scorm", "quiz", "live_session"]).optional(),
    contentUrl: z.string().nullable().optional(),
    contentData: z.string().nullable().optional(),
    durationMins: z.number().int().min(0).nullable().optional(),
    isPreview: z.boolean().optional(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const updated = await db.courseLesson.update({ where: { id }, data: body.data });

  await auditLog({
    userId: session.user.id,
    action: "COURSE_LESSON_UPDATED",
    entityType: "CourseLesson",
    entityId: id,
    metadata: {
      courseId: lesson.module.courseId,
      moduleId: lesson.moduleId,
      changes: body.data,
      severity: "MEDIUM",
    },
  }).catch(() => {});

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const lesson = await getLesson(id);
  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);
  if (!isAdmin && lesson.module.course.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.courseLesson.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
