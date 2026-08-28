import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { can } from "@/lib/permissions";
import type { Session } from "next-auth";

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

async function authorise(paperId: string, session: Session, permission: "exams:update" | "exams:delete") {
  const paper = await db.examPaper.findFirst({ where: { id: paperId } });
  if (!paper) return null;
  if (!(await can(session, permission))) return null;
  if (!["SUPER_ADMIN", "CERTIFICATION_OFFICER"].includes(session.user.role) && paper.creatorId !== session.user.id) return null;
  return paper;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, sectionId } = await params;
  if (!await authorise(id, session, "exams:update")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // IDOR guard: confirm the section is part of this paper before writing.
  const owned = await db.examSection.findFirst({ where: { id: sectionId, examPaperId: id } });
  if (!owned) return NextResponse.json({ error: "Section not found in this exam paper" }, { status: 404 });

  const patchSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    order: z.number().int().min(0).max(1000).optional(),
  });
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const section = await db.examSection.update({ where: { id: sectionId }, data: body.data });

  await auditLog({
    userId: session.user.id,
    action: "EXAM_SECTION_UPDATED",
    entityType: "ExamSection",
    entityId: sectionId,
    metadata: {
      examPaperId: id,
      changes: body.data,
      severity: "MEDIUM",
    },
  });

  return NextResponse.json({ section });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, sectionId } = await params;
  if (!await authorise(id, session, "exams:delete")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // IDOR guard: confirm the section is part of this paper before deleting.
  const owned = await db.examSection.findFirst({ where: { id: sectionId, examPaperId: id } });
  if (!owned) return NextResponse.json({ error: "Section not found in this exam paper" }, { status: 404 });

  await db.examSection.delete({ where: { id: sectionId } });
  return NextResponse.json({ ok: true });
}
