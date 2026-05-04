import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { moduleId } = await params;

  const mod = await db.courseModule.findUnique({ where: { id: moduleId }, include: { course: true } });
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  const isAdmin = ([USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER] as string[]).includes(session.user.role);
  if (!isAdmin && mod.course.creatorId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const schema = z.object({
    title: z.string().min(1),
    contentType: z.enum(["video", "pdf", "text", "scorm", "quiz", "live_session"]),
    contentUrl: z.string().nullable().optional(),
    contentData: z.string().nullable().optional(),  // JSON string
    durationMins: z.number().int().min(0).nullable().optional(),
    isPreview: z.boolean().optional(),
    scormPackageId: z.string().nullable().optional(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const count = await db.courseLesson.count({ where: { moduleId } });

  // If linking a SCORM package, verify it exists
  if (body.data.scormPackageId) {
    const pkg = await db.sCORMPackage.findUnique({ where: { id: body.data.scormPackageId } });
    if (!pkg) return NextResponse.json({ error: "SCORM package not found" }, { status: 404 });
  }

  const lesson = await db.courseLesson.create({
    data: {
      moduleId,
      title: body.data.title,
      contentType: body.data.contentType,
      contentUrl: body.data.contentUrl ?? null,
      contentData: body.data.contentData ?? null,
      durationMins: body.data.durationMins ?? null,
      isPreview: body.data.isPreview ?? false,
      order: count + 1,
    },
  });

  // If SCORM package specified, link it
  if (body.data.scormPackageId) {
    await db.sCORMPackage.update({
      where: { id: body.data.scormPackageId },
      data: { lessonId: lesson.id },
    });
  }

  await auditLog({
    userId: session.user.id,
    action: "COURSE_LESSON_CREATED",
    entityType: "CourseLesson",
    entityId: lesson.id,
    metadata: {
      moduleId,
      courseId: mod.course.id,
      title: body.data.title,
      contentType: body.data.contentType,
      severity: "MEDIUM",
    },
  });

  return NextResponse.json(lesson, { status: 201 });
}
