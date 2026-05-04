import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const paper = await db.examPaper.findFirst({ where: { id } });
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = ["SUPER_ADMIN", "CERTIFICATION_OFFICER", "EXAMINER"];
  if (!allowed.includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["SUPER_ADMIN", "CERTIFICATION_OFFICER"].includes(session.user.role) && paper.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const optionSchema = z.object({
    id: z.string().min(1).max(50),
    text: z.string().min(1).max(1000),
    isCorrect: z.boolean(),
  });

  const schema = z.object({
    sectionId: z.string().min(1),
    type: z.enum(["mcq_single", "mcq_multi", "true_false", "essay", "fill_blank", "drag_drop"]),
    text: z.string().min(1).max(5000),
    marks: z.number().int().min(1).max(500).default(1),
    options: z.array(optionSchema).max(10).optional(),
    correctAnswer: z.string().max(2000).nullable().optional(),
    explanation: z.string().max(2000).nullable().optional(),
    domain: z.string().max(200).nullable().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  });

  // A03:2021 — validate all external input before use
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // IDOR guard: confirm the section belongs to this exam paper before writing.
  const section = await db.examSection.findFirst({
    where: { id: body.data.sectionId, examPaperId: id },
  });
  if (!section) {
    return NextResponse.json({ error: "Section not found in this exam paper" }, { status: 404 });
  }

  const question = await db.examQuestion.create({
    data: {
      sectionId: body.data.sectionId,
      type: body.data.type,
      text: body.data.text,
      marks: body.data.marks,
      options: body.data.options && body.data.options.length > 0 ? JSON.stringify(body.data.options) : null,
      correctAnswer: body.data.correctAnswer ?? null,
      explanation: body.data.explanation ?? null,
      domain: body.data.domain ?? null,
      difficulty: body.data.difficulty ?? null,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "EXAM_QUESTION_CREATED",
    entityType: "ExamQuestion",
    entityId: question.id,
    metadata: {
      examPaperId: id,
      sectionId: body.data.sectionId,
      type: body.data.type,
      marks: body.data.marks,
      difficulty: body.data.difficulty ?? null,
      textPreview: body.data.text.slice(0, 120),
      severity: "MEDIUM",
    },
  });

  return NextResponse.json({ question });
}
