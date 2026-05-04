import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.EXAMINER];
const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const paper = await db.examPaper.findUnique({ where: { id } });
  if (!paper) return NextResponse.json({ error: "Exam paper not found" }, { status: 404 });

  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);
  if (!isAdmin && paper.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schema = z.object({
    title: z.string().min(2).optional(),
    description: z.string().optional().nullable(),
    instructions: z.string().optional().nullable(),
    schemeId: z.string().optional().nullable(),
    durationMins: z.number().min(15).optional(),
    passMark: z.number().min(0).max(100).optional(),
    totalMarks: z.number().min(1).optional(),
    isActive: z.boolean().optional(),
    randomiseQuestions: z.boolean().optional(),
    randomiseOptions: z.boolean().optional(),
    allowReview: z.boolean().optional(),
    requiresProctoring: z.boolean().optional(),
    tabSwitchLimit: z.number().min(1).max(20).optional(),
  });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // M (zero-questions guard + scheme required): when activating an exam,
  // verify it has at least one non-archived question and a scheme is linked.
  if (body.data.isActive === true) {
    const effectiveSchemeId = body.data.schemeId ?? paper.schemeId;
    if (!effectiveSchemeId) {
      return NextResponse.json(
        { error: "An exam paper must be linked to a certification scheme before it can be activated." },
        { status: 422 },
      );
    }

    const questionCount = await db.examQuestion.count({
      where: {
        section: { examPaperId: id },
        isArchived: false,
      },
    });
    if (questionCount === 0) {
      return NextResponse.json(
        { error: "An exam paper must have at least one question before it can be activated." },
        { status: 422 },
      );
    }
  }

  const updated = await db.examPaper.update({ where: { id }, data: body.data });

  await auditLog({
    userId: session.user.id,
    action: "EXAM_PAPER_UPDATED",
    entityType: "ExamPaper",
    entityId: id,
    metadata: body.data,
  });

  return NextResponse.json(updated);
}
