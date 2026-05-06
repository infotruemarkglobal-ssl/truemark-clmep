import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { from?: string; to?: string; metrics?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await auditLog({
    userId: session.user.id,
    action: "MANAGEMENT_REVIEW_CONDUCTED",
    entityType: "Platform",
    entityId: "management-review",
    metadata: {
      from: body.from,
      to: body.to,
      conductedAt: new Date().toISOString(),
      metrics: body.metrics,
    },
  });

  return NextResponse.json({ ok: true });
}
