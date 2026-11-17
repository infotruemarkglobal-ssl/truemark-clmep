import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { findSimilarPairs } from "@/lib/similarity";

const THRESHOLD = 0.6;

// GET /api/manage/exams/[id]/questions/similarity — flags question pairs in
// this paper that are too textually similar to safely coexist in the same
// bank (protects exam validity — a candidate who has seen one near-duplicate
// question effectively knows the answer to the other).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "exams:read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const paper = await db.examPaper.findFirst({ where: { id } });
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["SUPER_ADMIN", "CERTIFICATION_OFFICER"].includes(session.user.role) && paper.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const questions = await db.examQuestion.findMany({
    where: { section: { examPaperId: id }, isArchived: false },
    select: { id: true, text: true, sectionId: true },
  });

  const pairs = findSimilarPairs(questions, THRESHOLD);
  const byId = new Map(questions.map((q) => [q.id, q]));

  return NextResponse.json({
    threshold: THRESHOLD,
    questionCount: questions.length,
    pairs: pairs.map((p) => ({
      score: Math.round(p.score * 100) / 100,
      questionA: { id: p.questionAId, text: byId.get(p.questionAId)?.text ?? "" },
      questionB: { id: p.questionBId, text: byId.get(p.questionBId)?.text ?? "" },
    })),
  });
}
