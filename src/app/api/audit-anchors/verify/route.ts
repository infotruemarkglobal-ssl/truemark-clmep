import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { verifyAuditChain, verifyAnchor } from "@/lib/audit-verify";
import { db } from "@/lib/db";

// GET /api/audit-anchors/verify — runs the real, independent chain-integrity
// check (per-row content hash + row-to-row hash chain) plus re-verification
// of the most recent external anchor against its live-stored RFC 3161
// response. Not cached — this is a real, on-demand audit action.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "audit:read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const chain = await verifyAuditChain();

  const latestAnchor = await db.auditAnchor.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  const anchor = latestAnchor ? await verifyAnchor(latestAnchor.id) : null;

  return NextResponse.json({ chain, anchor });
}
