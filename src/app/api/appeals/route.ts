import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { addDays } from "date-fns";

// ISO 17024 Cl.7.9 — appeals must be resolved within 28 days of submission
const APPEAL_DEADLINE_DAYS = 28;
const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

export async function GET(_req?: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);

  try {
    const appeals = await db.appeal.findMany({
      where: isAdmin ? undefined : { userId: session.user.id },
      orderBy: { submittedAt: "desc" },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    return NextResponse.json(appeals);
  } catch (err) {
    console.error("[appeals GET]", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

const schema = z.object({
  type: z.enum(["exam_result", "certification_decision", "misconduct_finding", "other"]),
  subjectId: z.string().optional().nullable(),
  description: z.string().min(20, "Please provide at least 20 characters explaining your appeal").max(5000),
  evidenceUrls: z.array(z.string().url()).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const reference = `APL-${crypto.randomUUID().replace(/-/g, "").substring(0, 8).toUpperCase()}`;

  try {
    const appeal = await db.appeal.create({
      data: {
        reference,
        userId: session.user.id,
        type: body.data.type,
        subjectId: body.data.subjectId ?? null,
        description: body.data.description,
        evidenceUrls: body.data.evidenceUrls ? JSON.stringify(body.data.evidenceUrls) : null,
        status: "SUBMITTED",
        dueAt: addDays(new Date(), APPEAL_DEADLINE_DAYS),
      },
    });

    await auditLog({
      userId: session.user.id,
      action: "APPEAL_SUBMITTED",
      entityType: "Appeal",
      entityId: appeal.id,
      metadata: { reference, type: body.data.type },
    });

    return NextResponse.json(appeal, { status: 201 });
  } catch (err) {
    console.error("[appeals POST]", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
