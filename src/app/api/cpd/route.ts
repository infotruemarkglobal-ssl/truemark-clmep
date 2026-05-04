import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const records = await db.cPDRecord.findMany({
    where: { userId: session.user.id },
    orderBy: { activityDate: "desc" },
    include: { scheme: { select: { name: true, code: true } } },
  });

  return NextResponse.json(records);
}

const schema = z.object({
  title: z.string().min(2).max(255),
  type: z.enum(["course_completion", "conference", "self_study", "work_experience", "publication"]),
  hoursLogged: z.number().min(0.5).max(1000),
  activityDate: z.string().datetime(),
  schemeId: z.string().nullable().optional(),
  evidenceUrl: z.string().url().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // M: Rate limit CPD submissions to 20 per hour per user to prevent spam logging.
  const rl = await rateLimit(session.user.id, "cpd-submit", { limit: 20, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many CPD submissions. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  // M: CPD consent gate — user must have granted CPD_TRACKING consent.
  // GDPR Art. 6 / NDPR: processing for CPD audit trails requires a lawful basis;
  // we rely on consent, so check the most recent record for this purpose.
  const cpdConsent = await db.consentRecord.findFirst({
    where: { userId: session.user.id, purpose: "CPD_TRACKING" },
    orderBy: { grantedAt: "desc" },
  });
  if (!cpdConsent || !cpdConsent.granted || cpdConsent.withdrawnAt !== null) {
    return NextResponse.json(
      { error: "CPD tracking consent is required to log CPD activities. Please grant consent in your privacy settings before submitting." },
      { status: 403 },
    );
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // Validate schemeId if provided
  if (body.data.schemeId) {
    const scheme = await db.certificationScheme.findUnique({ where: { id: body.data.schemeId } });
    if (!scheme) return NextResponse.json({ error: "Scheme not found" }, { status: 404 });
  }

  const record = await db.cPDRecord.create({
    data: {
      userId: session.user.id,
      title: body.data.title,
      type: body.data.type,
      hoursLogged: body.data.hoursLogged,
      activityDate: new Date(body.data.activityDate),
      schemeId: body.data.schemeId ?? null,
      evidenceUrl: body.data.evidenceUrl ?? null,
      status: "pending",
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "CPD_ACTIVITY_LOGGED",
    entityType: "CPDRecord",
    entityId: record.id,
    metadata: { title: record.title, hoursLogged: record.hoursLogged, type: record.type },
  });

  return NextResponse.json(record, { status: 201 });
}
