import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

// GET /api/surveillance-reviews — list risk-based surveillance reviews
// (ISO 17024 Cl.9.4), optionally filtered by status.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "surveillance:read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;

  const reviews = await db.surveillanceReview.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "asc" }, { scheduledFor: "asc" }],
    take: 200,
    include: {
      certificate: { select: { id: true, certificateNumber: true, scheme: { select: { name: true, code: true } } } },
      user: { select: { firstName: true, lastName: true, email: true } },
      reviewer: { select: { firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ reviews });
}
