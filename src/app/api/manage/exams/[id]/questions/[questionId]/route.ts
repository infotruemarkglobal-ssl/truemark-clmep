import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; questionId: string }> };

async function authorise(paperId: string, userId: string, role: string) {
  const paper = await db.examPaper.findFirst({ where: { id: paperId } });
  if (!paper) return null;
  const allowed = ["SUPER_ADMIN", "CERTIFICATION_OFFICER", "EXAMINER"];
  if (!allowed.includes(role)) return null;
  if (!["SUPER_ADMIN", "CERTIFICATION_OFFICER"].includes(role) && paper.creatorId !== userId) return null;
  return paper;
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, questionId } = await params;
  if (!await authorise(id, session.user.id, session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Archive instead of hard-delete to preserve attempt history
  await db.examQuestion.update({ where: { id: questionId }, data: { isArchived: true } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, questionId } = await params;
  if (!await authorise(id, session.user.id, session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const optionSchema = z.object({
    id: z.string().min(1).max(50),
    text: z.string().min(1).max(1000),
    isCorrect: z.boolean(),
  });

  const patchSchema = z.object({
    type: z.enum(["mcq_single", "mcq_multi", "true_false", "essay", "fill_blank", "drag_drop"]).optional(),
    text: z.string().min(1).max(5000).optional(),
    marks: z.number().int().min(1).max(500).optional(),
    options: z.array(optionSchema).max(10).nullable().optional(),
    correctAnswer: z.string().max(2000).nullable().optional(),
    explanation: z.string().max(2000).nullable().optional(),
    domain: z.string().max(200).nullable().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  });

  // A03:2021 — validate all external input before use
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const question = await db.examQuestion.update({
    where: { id: questionId },
    data: {
      type: body.data.type,
      text: body.data.text,
      marks: body.data.marks,
      options: body.data.options !== undefined ? (body.data.options ? JSON.stringify(body.data.options) : null) : undefined,
      correctAnswer: body.data.correctAnswer,
      explanation: body.data.explanation,
      domain: body.data.domain,
      difficulty: body.data.difficulty,
      // Cl.6.1 ISO 17024 — increment version on every edit so snapshots stored in
      // ExamResponse.questionVersionSnapshot can be correlated with the change history.
      version: { increment: 1 },
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "EXAM_QUESTION_UPDATED",
    entityType: "ExamQuestion",
    entityId: questionId,
    metadata: {
      examPaperId: id,
      changes: body.data,
      version: question.version,
      severity: "MEDIUM",
    },
  });

  return NextResponse.json({ question });
}
