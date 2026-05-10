import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  reason: z.string().min(10).max(1000),
});

// PATCH /api/certificates/[id]/revoke — revoke an active certificate
// ISO 17024 Cl.9 — revocation must be traceable, authorised, and immediately
// reflected in the verification endpoint. Only Certification Officers and
// Super Admins may revoke certificates.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ALLOWED = [USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.SUPER_ADMIN];
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — Certification Officer role required" }, { status: 403 });
  }

  // H12: 30 revocations per hour per officer — accidental bulk revocations
  // must be throttled to limit blast radius.
  const rl = await rateLimit(session.user.id, "cert-revoke", { limit: 30, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many revocation requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const { id } = await params;

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { reason } = body.data;

  // CRITICAL: revocation update + audit log written atomically.
  // Array form is PgBouncer transaction-pooling compatible (Supabase).
  // Pre-checks (not-found, already-revoked) are read-only and run outside the
  // transaction; the small TOCTOU window is acceptable for this admin-only route.

  const existing = await db.certificate.findUnique({
    where: { id },
    select: { id: true, status: true, certificateNumber: true, userId: true, schemeId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }
  if (existing.status === "REVOKED") {
    return NextResponse.json({ error: "Certificate is already revoked" }, { status: 409 });
  }

  const [certificate] = await db.$transaction([
    db.certificate.update({
      where: { id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revocationReason: reason,
      },
    }),
    db.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CERTIFICATE_REVOKED",
        entityType: "Certificate",
        entityId: id,
        metadata: JSON.stringify({
          certificateNumber: existing.certificateNumber,
          candidateId: existing.userId,
          schemeId: existing.schemeId,
          reason,
          revokedBy: session.user.id,
        }),
      },
    }),
  ]);

  // Notify the certificate holder — best-effort, must not undo revocation
  await db.notification.create({
    data: {
      userId: certificate.userId,
      type: "SYSTEM_ALERT",
      title: "Certificate Revoked",
      message: `Your certificate ${certificate.certificateNumber} has been revoked. If you believe this is an error, please contact certifications@truemarkglobal.com.`,
      link: `/verify/${certificate.certificateNumber}`,
    },
  }).catch(() => {});

  return NextResponse.json({ certificate });
}
