import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

// POST /api/audit-programme — schedule a new internal audit (SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== USER_ROLES.SUPER_ADMIN)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    title?: string;
    scope?: string;
    plannedDate?: string;
    leadAuditorId?: string;
    auditType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, scope, plannedDate, leadAuditorId, auditType = "INTERNAL" } = body;
  if (!title || !scope || !plannedDate || !leadAuditorId)
    return NextResponse.json({ error: "title, scope, plannedDate and leadAuditorId are required" }, { status: 400 });

  const parsedDate = new Date(plannedDate);
  if (isNaN(parsedDate.getTime()))
    return NextResponse.json({ error: "Invalid plannedDate" }, { status: 400 });

  // Generate sequential reference: IA-[YYYY]-[NNN]
  const year = new Date().getFullYear();
  const prefix = `IA-${year}-`;
  const existingCount = await db.internalAudit.count({
    where: { reference: { startsWith: prefix } },
  });
  const reference = `${prefix}${String(existingCount + 1).padStart(3, "0")}`;

  const audit = await db.internalAudit.create({
    data: { reference, title, scope, auditType, plannedDate: parsedDate, leadAuditorId },
    include: { leadAuditor: { select: { id: true, firstName: true, lastName: true } } },
  });

  await auditLog({
    userId: session.user.id,
    action: "INTERNAL_AUDIT_CREATED",
    entityType: "InternalAudit",
    entityId: audit.id,
    metadata: { reference, title },
  });

  return NextResponse.json(audit, { status: 201 });
}
