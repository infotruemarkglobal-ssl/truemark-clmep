import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { findSimilarPairs } from "@/lib/similarity";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];
const SIMILARITY_THRESHOLD = 0.6;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "exams:update"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const paper = await db.examPaper.findUnique({ where: { id } });
  if (!paper) return NextResponse.json({ error: "Exam paper not found" }, { status: 404 });

  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);
  if (!isAdmin && paper.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawBody = await req.json();

  // Formal version control (ISO 17024 Cl.7.3) — approving a version is a
  // distinct action from editing content, restricted to CO/SUPER_ADMIN
  // regardless of who created the paper.
  if (rawBody?.action === "approve") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (paper.approvalStatus === "APPROVED") {
      return NextResponse.json({ error: "This version is already approved" }, { status: 409 });
    }
    const updated = await db.examPaper.update({
      where: { id },
      data: { approvalStatus: "APPROVED", approvedBy: session.user.id, approvedAt: new Date() },
    });
    await auditLog({
      userId: session.user.id,
      action: "EXAM_PAPER_APPROVED",
      entityType: "ExamPaper",
      entityId: id,
      metadata: { version: paper.version },
    });
    return NextResponse.json(updated);
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
    // A one-time bypass for the similarity guard below — not persisted,
    // just acknowledges the flagged pairs are legitimate (e.g. deliberate
    // variants) and activation should proceed anyway.
    acknowledgeSimilarity: z.boolean().optional(),
  });

  const body = schema.safeParse(rawBody);
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // Any content-changing edit invalidates the current approval — bump the
  // version and drop back to DRAFT, mirroring ExamQuestion's existing
  // { increment: 1 } pattern (questions/[questionId]/route.ts).
  const CONTENT_FIELDS = ["title", "description", "instructions", "durationMins", "passMark", "totalMarks"] as const;
  const isContentEdit = CONTENT_FIELDS.some((f) => f in body.data);

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

    // Formal version control: a paper can only go live once an explicit
    // approval has been recorded for its current version. If this same
    // PATCH also edits content, that content change resets approval below —
    // so activation must be rejected even if the paper was APPROVED prior
    // to this request.
    if (isContentEdit || paper.approvalStatus !== "APPROVED") {
      return NextResponse.json(
        { error: "This exam paper's current version has not been approved yet. Approve it before activating." },
        { status: 422 },
      );
    }

    // Cross-item similarity guard (ISO 17024 exam-validity protection) —
    // reject activation if any two questions in the bank are too similar,
    // unless the caller explicitly acknowledges the flagged pairs.
    if (!body.data.acknowledgeSimilarity) {
      const questions = await db.examQuestion.findMany({
        where: { section: { examPaperId: id }, isArchived: false },
        select: { id: true, text: true },
      });
      const similarPairs = findSimilarPairs(questions, SIMILARITY_THRESHOLD);
      if (similarPairs.length > 0) {
        return NextResponse.json(
          {
            error: `${similarPairs.length} question pair(s) in this paper are too similar to safely coexist. Review and edit them, or activate again to acknowledge and proceed.`,
            similarPairs: similarPairs.slice(0, 10).map((p) => ({ questionAId: p.questionAId, questionBId: p.questionBId, score: Math.round(p.score * 100) / 100 })),
          },
          { status: 422 },
        );
      }
    }
  }

  const { acknowledgeSimilarity, ...writableData } = body.data;
  void acknowledgeSimilarity; // consumed above; excluded here since ExamPaper has no such column

  const updated = await db.examPaper.update({
    where: { id },
    data: {
      ...writableData,
      ...(isContentEdit ? { version: { increment: 1 }, approvalStatus: "DRAFT", approvedBy: null, approvedAt: null } : {}),
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "EXAM_PAPER_UPDATED",
    entityType: "ExamPaper",
    entityId: id,
    metadata: writableData,
  });

  return NextResponse.json(updated);
}
