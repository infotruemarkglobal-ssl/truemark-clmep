import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];

async function checkAccess(session: { user: { id: string; role: string } }, moduleId: string) {
  const mod = await db.courseModule.findUnique({ where: { id: moduleId }, include: { course: true } });
  if (!mod) return null;
  const isAdmin = ([USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER] as string[]).includes(session.user.role);
  if (!isAdmin && mod.course.creatorId !== session.user.id) return null;
  return mod;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { moduleId } = await params;
  const mod = await checkAccess(session, moduleId);
  if (!mod) return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });

  const schema = z.object({ title: z.string().min(1).optional(), description: z.string().nullable().optional() });
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const updated = await db.courseModule.update({ where: { id: moduleId }, data: body.data });

  await auditLog({
    userId: session.user.id,
    action: "COURSE_MODULE_UPDATED",
    entityType: "CourseModule",
    entityId: moduleId,
    metadata: {
      courseId: mod.courseId,
      changes: body.data,
      severity: "MEDIUM",
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { moduleId } = await params;
  const mod = await checkAccess(session, moduleId);
  if (!mod) return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });

  await db.courseModule.delete({ where: { id: moduleId } });
  return NextResponse.json({ deleted: true });
}
