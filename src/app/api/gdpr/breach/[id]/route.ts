import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";
import { addHours } from "date-fns";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];
const DPA_WINDOW_HOURS = 72;

const schema = z.object({
  reportedToAuthority: z.boolean().optional(),
  candidatesNotified: z.boolean().optional(),
  status: z.enum(["open", "investigating", "resolved"]).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

// ── PATCH /api/gdpr/breach/[id] — update breach status ───────────────────────
// Used to record when the DPA has been notified (Art. 33) and when affected
// data subjects have been individually notified (Art. 34).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const existing = await db.breachIncident.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Breach not found" }, { status: 404 });

  const now = new Date();
  const updateData: Record<string, unknown> = {};

  if (body.data.reportedToAuthority === true && !existing.reportedToAuthority) {
    updateData.reportedToAuthority = true;
    updateData.authorityReportedAt = now;

    // Flag if reported outside the 72-hour window
    const deadline = addHours(existing.discoveredAt, DPA_WINDOW_HOURS);
    if (now > deadline) {
      console.warn(
        `[GDPR] Breach ${id} reported to DPA OUTSIDE 72-hour window. ` +
        `Discovered: ${existing.discoveredAt.toISOString()}, Reported: ${now.toISOString()}`
      );
    }
  }
  if (body.data.candidatesNotified === true && !existing.candidatesNotified) {
    updateData.candidatesNotified = true;
    updateData.candidatesNotifiedAt = now;
  }
  if (body.data.status) {
    updateData.status = body.data.status;
    if (body.data.status === "resolved") updateData.resolvedAt = now;
  }

  const breach = await db.breachIncident.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    action: "BREACH_INCIDENT_UPDATED",
    entityType: "BreachIncident",
    entityId: id,
    metadata: { changes: updateData },
  });

  return NextResponse.json(breach);
}
