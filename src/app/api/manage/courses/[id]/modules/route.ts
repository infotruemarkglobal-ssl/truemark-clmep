import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const isAdmin = ([USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER] as string[]).includes(session.user.role);
  if (!isAdmin && course.creatorId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const schema = z.object({ title: z.string().min(1), description: z.string().optional() });
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const count = await db.courseModule.count({ where: { courseId } });

  const module = await db.courseModule.create({
    data: { courseId, title: body.data.title, description: body.data.description ?? null, order: count + 1 },
    include: { lessons: { orderBy: { order: "asc" } } },
  });

  await auditLog({
    userId: session.user.id,
    action: "COURSE_MODULE_CREATED",
    entityType: "CourseModule",
    entityId: module.id,
    metadata: {
      courseId,
      title: body.data.title,
      order: module.order,
      severity: "MEDIUM",
    },
  });

  return NextResponse.json(module, { status: 201 });
}
