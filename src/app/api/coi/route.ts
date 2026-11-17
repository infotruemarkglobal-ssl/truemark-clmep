import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { auditLog } from "@/lib/audit";

// GET /api/coi — a staff member's own declarations, or (compliance:read) every
// declaration in the platform, for review.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(STAFF_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canReviewAll = await can(session, "compliance:read");
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");

  const declarations = await db.cOIDeclaration.findMany({
    where: canReviewAll && scope === "all" ? undefined : { userId: session.user.id },
    orderBy: { declaredAt: "desc" },
    include: {
      user: { select: { firstName: true, lastName: true, email: true, role: true } },
      subject: { select: { firstName: true, lastName: true, email: true } },
    },
    take: 200,
  });

  return NextResponse.json({ declarations, canReviewAll });
}

const createSchema = z.object({
  declarationText: z.string().min(10).max(2000),
  hasConflict: z.boolean(),
  conflictDetails: z.string().max(2000).optional().nullable(),
  // A staff member knows the candidate by email, not by internal id.
  subjectEmail: z.string().email().optional().or(z.literal("")),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  // How long this declaration stands before it must be renewed — mirrors the
  // 12-month cadence used elsewhere for staff-facing recurring attestations.
  validMonths: z.number().min(1).max(36).default(12),
});

// POST /api/coi — any staff member records a real conflict-of-interest (or
// "no conflict") declaration. This is the impartiality-risk process itself:
// a structured, subject-aware record, not just a free-text note nobody reads.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(STAFF_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const { declarationText, hasConflict, conflictDetails, subjectEmail, riskLevel, validMonths } = body.data;

  let subjectUserId: string | null = null;
  if (subjectEmail) {
    const subject = await db.user.findUnique({ where: { email: subjectEmail.toLowerCase() }, select: { id: true } });
    if (!subject) return NextResponse.json({ error: "No candidate found with that email" }, { status: 404 });
    subjectUserId = subject.id;
  }

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + validMonths);

  const declaration = await db.cOIDeclaration.create({
    data: {
      userId: session.user.id,
      declarationText,
      hasConflict,
      conflictDetails: conflictDetails ?? null,
      subjectUserId,
      riskLevel: hasConflict ? riskLevel : "LOW",
      expiresAt,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "COI_DECLARED",
    entityType: "COIDeclaration",
    entityId: declaration.id,
    metadata: { hasConflict, subjectUserId: subjectUserId ?? null, riskLevel: declaration.riskLevel },
  });

  return NextResponse.json(declaration, { status: 201 });
}
