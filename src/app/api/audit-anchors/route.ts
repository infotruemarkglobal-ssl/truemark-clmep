import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

// GET /api/audit-anchors — real RFC 3161 external notarisations of the
// audit-log hash chain, most recent first.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "audit:read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const anchors = await db.auditAnchor.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, digestHash: true, chainTipLogId: true, tsaUrl: true, tsaGenTime: true, tsaSerial: true, createdAt: true },
  });

  return NextResponse.json({ anchors });
}
