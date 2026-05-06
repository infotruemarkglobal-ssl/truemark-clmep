import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/certificates/[id]/terms-ack
// Returns whether the current user has acknowledged terms for this certificate.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify ownership — don't reveal whether a certificate exists to non-owners.
  const cert = await db.certificate.findUnique({
    where: { id, deletedAt: null },
    select: { userId: true },
  });
  if (!cert || cert.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ack = await db.certificateTermsAck.findUnique({
    where: { certificateId_userId: { certificateId: id, userId: session.user.id } },
    select: { acknowledgedAt: true },
  });

  return NextResponse.json({
    acknowledged: !!ack,
    ...(ack ? { acknowledgedAt: ack.acknowledgedAt.toISOString() } : {}),
  });
}

// POST /api/certificates/[id]/terms-ack
// Records that the current user has accepted the certificate terms of use.
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const cert = await db.certificate.findUnique({
    where: { id, deletedAt: null },
    select: { userId: true },
  });
  if (!cert || cert.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ip =
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;

  // Upsert is idempotent — if the user clicks Accept twice, no duplicate is created.
  await db.certificateTermsAck.upsert({
    where: { certificateId_userId: { certificateId: id, userId: session.user.id } },
    create: { certificateId: id, userId: session.user.id, ipAddress: ip },
    update: {},
  });

  await auditLog({
    userId: session.user.id,
    action: "CERTIFICATE_TERMS_ACKNOWLEDGED",
    entityType: "Certificate",
    entityId: id,
    ipAddress: ip ?? undefined,
  });

  return NextResponse.json({ success: true });
}
