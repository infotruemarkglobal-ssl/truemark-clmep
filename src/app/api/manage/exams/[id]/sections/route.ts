import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

const schema = z.object({
  title: z.string().min(1).max(200).default("New Section"),
  order: z.number().int().min(0).max(1000).default(0),
});

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

  // A03:2021 — validate all external input before use
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const section = await db.examSection.create({
    data: { examPaperId: id, title: body.data.title, order: body.data.order, marks: 0 },
  });

  await auditLog({
    userId: session.user.id,
    action: "EXAM_SECTION_CREATED",
    entityType: "ExamSection",
    entityId: section.id,
    metadata: {
      examPaperId: id,
      title: body.data.title,
      order: body.data.order,
      severity: "MEDIUM",
    },
  });

  return NextResponse.json({ section });
}
