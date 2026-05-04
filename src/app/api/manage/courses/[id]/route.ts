import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];
const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const course = await db.course.findUnique({ where: { id } });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);
  if (!isAdmin && course.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schema = z.object({
    title: z.string().min(2).optional(),
    shortDescription: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
    price: z.number().min(0).optional(),
    cpdHours: z.number().min(0).optional(),
    durationHours: z.number().min(0).nullable().optional(),
    minProgressToExam: z.number().min(0).max(100).optional(),
    thumbnailUrl: z.string().url().nullable().optional(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const updated = await db.course.update({
    where: { id },
    data: {
      ...body.data,
      publishedAt: body.data.status === "PUBLISHED" && course.status !== "PUBLISHED" ? new Date() : undefined,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "COURSE_UPDATED",
    entityType: "Course",
    entityId: id,
    metadata: body.data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const course = await db.course.findUnique({ where: { id }, include: { _count: { select: { enrolments: true } } } });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  if (course._count.enrolments > 0) {
    // Archive instead of delete if there are enrolments
    await db.course.update({ where: { id }, data: { status: "ARCHIVED" } });
    return NextResponse.json({ archived: true });
  }

  await db.course.delete({ where: { id } });

  await auditLog({
    userId: session.user.id,
    action: "COURSE_DELETED",
    entityType: "Course",
    entityId: id,
    metadata: { title: course.title },
  });

  return NextResponse.json({ deleted: true });
}
