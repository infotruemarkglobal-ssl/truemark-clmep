import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { auditLog } from "@/lib/audit";

// Mirrors the transition-map style already used for complaints
// (src/app/api/manage/complaints/route.ts) — a declaration is reviewed by
// someone OTHER than the person who declared it, never self-resolved.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ["UNDER_REVIEW", "RESOLVED"],
  UNDER_REVIEW: ["RESOLVED", "ACTIVE"],
  RESOLVED: [],
};

const schema = z.object({
  status: z.enum(["ACTIVE", "UNDER_REVIEW", "RESOLVED"]),
  reviewNote: z.string().max(2000).optional(),
});

// PATCH /api/coi/[id] — CO/AUDITOR/SUPER_ADMIN (compliance:read) reviews a
// declaration and moves it through the impartiality-risk process.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "compliance:read"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const declaration = await db.cOIDeclaration.findUnique({ where: { id } });
  if (!declaration) return NextResponse.json({ error: "Declaration not found" }, { status: 404 });

  // Separation of duties: the declarer cannot review/resolve their own
  // declaration — that would defeat the point of an impartiality process.
  if (declaration.userId === session.user.id) {
    return NextResponse.json({ error: "You cannot review your own conflict-of-interest declaration" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const allowed = ALLOWED_TRANSITIONS[declaration.status] ?? [];
  if (!allowed.includes(body.data.status)) {
    return NextResponse.json({ error: `Cannot move a declaration from ${declaration.status} to ${body.data.status}` }, { status: 409 });
  }

  const updated = await db.cOIDeclaration.update({
    where: { id },
    data: { status: body.data.status },
  });

  await auditLog({
    userId: session.user.id,
    action: "COI_STATUS_CHANGED",
    entityType: "COIDeclaration",
    entityId: id,
    metadata: { from: declaration.status, to: body.data.status, reviewNote: body.data.reviewNote ?? null },
  });

  return NextResponse.json(updated);
}
