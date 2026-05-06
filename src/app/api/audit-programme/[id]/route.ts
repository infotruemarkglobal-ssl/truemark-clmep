import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

// PATCH /api/audit-programme/[id]
// SUPER_ADMIN: may update any field (title, scope, plannedDate, leadAuditorId, status, findings)
// Lead auditor: may only update findings and status transitions
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isSuperAdmin = session.user.role === USER_ROLES.SUPER_ADMIN;
  const isAuditor = session.user.role === USER_ROLES.AUDITOR;
  if (!isSuperAdmin && !isAuditor)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.internalAudit.findUnique({ where: { id }, select: { id: true, status: true, leadAuditorId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isLeadAuditor = existing.leadAuditorId === session.user.id;
  if (!isSuperAdmin && !isLeadAuditor)
    return NextResponse.json({ error: "Forbidden — only the lead auditor or a super admin may update this audit" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Lead auditors may only write findings and status.
  const allowed = isSuperAdmin
    ? ["title", "scope", "plannedDate", "leadAuditorId", "auditType", "status", "findings"]
    : ["findings", "status"];

  const updateData: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updateData[key] = body[key];
  }

  if ("plannedDate" in updateData) {
    const d = new Date(updateData.plannedDate as string);
    if (isNaN(d.getTime()))
      return NextResponse.json({ error: "Invalid plannedDate" }, { status: 400 });
    updateData.plannedDate = d;
  }

  const VALID_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
  if ("status" in updateData && !VALID_STATUSES.includes(updateData.status as string))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  if (updateData.status === "COMPLETED") {
    updateData.completedAt = new Date();
  }

  const updated = await db.internalAudit.update({
    where: { id },
    data: updateData as Parameters<typeof db.internalAudit.update>[0]["data"],
    include: {
      leadAuditor: { select: { id: true, firstName: true, lastName: true } },
      nonConformities: { select: { id: true, reference: true, type: true, description: true, status: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "INTERNAL_AUDIT_UPDATED",
    entityType: "InternalAudit",
    entityId: id,
    metadata: { changed: Object.keys(updateData) },
  });

  return NextResponse.json(updated);
}
