import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { can } from "@/lib/permissions";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  SCHEDULED: ["IN_PROGRESS", "COMPLETED", "ESCALATED"],
  IN_PROGRESS: ["COMPLETED", "ESCALATED"],
  COMPLETED: [],
  ESCALATED: ["COMPLETED"],
};

const schema = z.object({
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "ESCALATED"]),
  findings: z.string().max(2000).optional(),
});

// PATCH /api/surveillance-reviews/[id] — record the outcome of a
// risk-based surveillance review.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "surveillance:manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const review = await db.surveillanceReview.findUnique({ where: { id } });
  if (!review) return NextResponse.json({ error: "Surveillance review not found" }, { status: 404 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const allowed = ALLOWED_TRANSITIONS[review.status] ?? [];
  if (!allowed.includes(body.data.status)) {
    return NextResponse.json({ error: `Cannot move a review from ${review.status} to ${body.data.status}` }, { status: 409 });
  }
  if ((body.data.status === "COMPLETED" || body.data.status === "ESCALATED") && !body.data.findings) {
    return NextResponse.json({ error: "Findings are required to complete or escalate a review" }, { status: 400 });
  }

  const isFinal = body.data.status === "COMPLETED";

  const updated = await db.surveillanceReview.update({
    where: { id },
    data: {
      status: body.data.status,
      findings: body.data.findings ?? review.findings,
      reviewerId: session.user.id,
      completedAt: isFinal ? new Date() : review.completedAt,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "SURVEILLANCE_REVIEW_UPDATED",
    entityType: "SurveillanceReview",
    entityId: id,
    metadata: { from: review.status, to: body.data.status, findings: body.data.findings ?? null },
  });

  return NextResponse.json(updated);
}
