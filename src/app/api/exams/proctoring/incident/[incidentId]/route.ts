import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { auditLog } from "@/lib/audit";

const schema = z.object({
  reviewNote: z.string().max(1000).optional().nullable(),
});

// PATCH /api/exams/proctoring/incident/[incidentId] — human-oversight control
// for AI/rule-based proctoring signals (ISO/IEC 17024:2026 AI governance
// requirement). `reviewed`/`reviewNote` have existed on ProctoringIncident
// since it was first modelled but nothing ever wrote them — every incident,
// including ones that auto-voided an exam attempt, was permanently
// unreviewed. This is the missing human-in-the-loop step.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ incidentId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "exams:proctor"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { incidentId } = await params;
  const incident = await db.proctoringIncident.findUnique({ where: { id: incidentId } });
  if (!incident) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const updated = await db.proctoringIncident.update({
    where: { id: incidentId },
    data: { reviewed: true, reviewNote: body.data.reviewNote ?? null },
  });

  await auditLog({
    userId: session.user.id,
    action: "PROCTORING_INCIDENT_REVIEWED",
    entityType: "ProctoringIncident",
    entityId: incidentId,
    metadata: { type: incident.type, severity: incident.severity, reviewNote: body.data.reviewNote ?? null },
  });

  return NextResponse.json(updated);
}
