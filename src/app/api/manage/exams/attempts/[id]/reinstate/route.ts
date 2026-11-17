import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { auditLog } from "@/lib/audit";

const schema = z.object({
  justification: z.string().min(10).max(1000),
});

// PATCH /api/manage/exams/attempts/[id]/reinstate — human-oversight override
// for the automated, AI-signal-driven void in
// src/app/api/exams/proctoring/incident/route.ts. That auto-void stays a
// necessary real-time circuit-breaker (ISO/IEC 17024:2026 still expects
// real-time invigilation to actually act during the exam) — but it must not
// be the FINAL word. This route is the "documented human-oversight control"
// the 2026 revision requires for any AI-assisted assessment decision: a real
// person, not the original proctor, reviews and can reverse it.
//
// Reinstating does not silently resume the exam — the live session state
// (timer, in-progress answers) is gone. It moves the attempt to UNDER_REVIEW
// so a Certification Officer can decide the actual remedy (re-sit, manual
// re-grade of what was submitted, etc.) as a separate, deliberate step.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "exams:reinstate", ["SUPER_ADMIN", "CERTIFICATION_OFFICER"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const attempt = await db.examAttempt.findUnique({ where: { id } });
  if (!attempt) return NextResponse.json({ error: "Exam attempt not found" }, { status: 404 });
  if (attempt.status !== "VOIDED") {
    return NextResponse.json({ error: "Only a VOIDED attempt can be reinstated for review" }, { status: 409 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const updated = await db.examAttempt.update({
    where: { id },
    data: { status: "UNDER_REVIEW" },
  });

  await auditLog({
    userId: session.user.id,
    action: "EXAM_ATTEMPT_REINSTATED",
    entityType: "ExamAttempt",
    entityId: id,
    metadata: { justification: body.data.justification, previousStatus: "VOIDED" },
  });

  return NextResponse.json(updated);
}
