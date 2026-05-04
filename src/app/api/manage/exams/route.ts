import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.EXAMINER];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const PAGE_SIZE = 25;

  const isSuperAdmin = ([USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER] as string[]).includes(session.user.role);
  const isExaminer = session.user.role === USER_ROLES.EXAMINER;

  // EXAMINERs see papers they created OR have graded (so assigned graders see relevant papers).
  let where: Record<string, unknown> | undefined;
  if (isSuperAdmin) {
    where = undefined;
  } else if (isExaminer) {
    const gradedPaperIds = await db.examGrade.findMany({
      where: { examinerId: session.user.id },
      select: { attempt: { select: { examPaperId: true } } },
      distinct: ["attemptId"],
    }).then((grades) => grades.map((g) => g.attempt.examPaperId));

    where = {
      OR: [
        { creatorId: session.user.id },
        { id: { in: gradedPaperIds } },
      ],
    };
  } else {
    where = { creatorId: session.user.id };
  }

  const papers = await db.examPaper.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      creator: { select: { firstName: true, lastName: true } },
      scheme: { select: { name: true, code: true } },
      sections: { include: { _count: { select: { questions: true } } } },
      _count: { select: { attempts: true } },
    },
  });

  const hasMore = papers.length > PAGE_SIZE;
  const page = hasMore ? papers.slice(0, PAGE_SIZE) : papers;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({ papers: page, nextCursor });
}

const schema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  instructions: z.string().optional(),
  schemeId: z.string().nullable().optional(),
  durationMins: z.number().min(15).default(120),
  passMark: z.number().min(0).max(100).default(70),
  totalMarks: z.number().min(1).default(100),
  randomiseQuestions: z.boolean().default(true),
  randomiseOptions: z.boolean().default(true),
  allowReview: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const paper = await db.examPaper.create({
    data: {
      title: body.data.title,
      description: body.data.description ?? null,
      instructions: body.data.instructions ?? null,
      schemeId: body.data.schemeId ?? null,
      durationMins: body.data.durationMins,
      passMark: body.data.passMark,
      totalMarks: body.data.totalMarks,
      randomiseQuestions: body.data.randomiseQuestions,
      randomiseOptions: body.data.randomiseOptions,
      allowReview: body.data.allowReview,
      creatorId: session.user.id,
      isActive: false, // Start inactive until questions are added
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "EXAM_PAPER_CREATED",
    entityType: "ExamPaper",
    entityId: paper.id,
    metadata: { title: paper.title },
  });

  return NextResponse.json(paper, { status: 201 });
}
