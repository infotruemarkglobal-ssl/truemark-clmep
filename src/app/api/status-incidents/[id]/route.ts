import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { auditLog } from "@/lib/audit";

const schema = z.object({
  message: z.string().min(3).max(2000).optional(),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]).optional(),
});

// PATCH /api/status-incidents/[id] — update or resolve an incident.
// security:manage only.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "security:manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.statusIncident.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  if (Object.keys(body.data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const resolving = body.data.status === "resolved" && existing.status !== "resolved";

  const updated = await db.statusIncident.update({
    where: { id },
    data: {
      ...body.data,
      resolvedAt: resolving ? new Date() : existing.resolvedAt,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "STATUS_INCIDENT_UPDATED",
    entityType: "StatusIncident",
    entityId: id,
    metadata: { status: updated.status, message: body.data.message ?? null },
  });

  return NextResponse.json(updated);
}
