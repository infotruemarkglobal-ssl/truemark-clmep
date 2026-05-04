import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

const CONSENT_PURPOSES = [
  "MARKETING",
  "DIRECTORY_LISTING",
  "RESEARCH",
  "CPD_TRACKING",
  "THIRD_PARTY_SHARING",
] as const;

const schema = z.object({
  purpose: z.enum(CONSENT_PURPOSES),
  granted: z.boolean(),
});

// ── GET /api/gdpr/consent — return current consent status for this user ───────
// Art. 7(1) GDPR — controller must be able to demonstrate consent was given.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Return the most recent record per purpose — earlier records may have been
  // superseded by explicit withdrawal or re-grant.
  const records = await db.consentRecord.findMany({
    where: { userId: session.user.id },
    orderBy: { grantedAt: "desc" },
  });

  // Deduplicate: keep only the latest record per purpose
  const byPurpose = new Map<string, typeof records[0]>();
  for (const r of records) {
    if (!byPurpose.has(r.purpose)) byPurpose.set(r.purpose, r);
  }

  return NextResponse.json(Object.fromEntries(
    CONSENT_PURPOSES.map((p) => {
      const r = byPurpose.get(p);
      return [p, r ? { granted: r.granted && !r.withdrawnAt, recordedAt: r.grantedAt, withdrawnAt: r.withdrawnAt } : null];
    })
  ));
}

// ── POST /api/gdpr/consent — grant or withdraw consent for a purpose ──────────
// Art. 7(3) GDPR — withdrawal must be as easy as giving consent.
// Creates a new ConsentRecord rather than mutating the old one — the full history
// of grants and withdrawals is kept for Art. 7(1) demonstration.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { purpose, granted } = body.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  // If withdrawing: stamp withdrawnAt on the most recent active grant record,
  // then create a new record recording the withdrawal. This preserves full history.
  if (!granted) {
    await db.consentRecord.updateMany({
      where: { userId: session.user.id, purpose, withdrawnAt: null, granted: true },
      data: { withdrawnAt: new Date() },
    });
  }

  const record = await db.consentRecord.create({
    data: {
      userId: session.user.id,
      purpose,
      granted,
      ipAddress: ip,
      userAgent,
      withdrawnAt: granted ? null : new Date(),
    },
  });

  await auditLog({
    userId: session.user.id,
    action: granted ? "CONSENT_GRANTED" : "CONSENT_WITHDRAWN",
    entityType: "ConsentRecord",
    entityId: record.id,
    metadata: { purpose, ip },
  });

  return NextResponse.json({ ok: true, purpose, granted });
}
