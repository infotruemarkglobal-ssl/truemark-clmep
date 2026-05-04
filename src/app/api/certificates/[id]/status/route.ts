import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/certificates/[id]/status
// StatusList2021Entry endpoint referenced in Open Badge 3.0 JWT credentialStatus.
// Returns a JSON-LD credential status document so verifiers can check whether
// the certificate has been revoked, suspended, or expired since issuance.
// This endpoint is public — no auth required (verifiers are third parties).
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const cert = await db.certificate.findUnique({
    where: { id },
    select: {
      id: true,
      certificateNumber: true,
      status: true,
      revokedAt: true,
      // revocationReason is intentionally excluded — it may contain sensitive
      // disciplinary details (e.g. "Exam misconduct") that must not be disclosed
      // to unauthenticated third-party verifiers (GDPR Art. 5(1)(c) — data minimisation).
      expiresAt: true,
    },
  });

  if (!cert) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.truemarkglobal.com";
  const isRevoked = cert.status === "REVOKED" || cert.status === "SUSPENDED";
  const isExpired = cert.expiresAt ? cert.expiresAt < new Date() : false;

  // StatusList2021 JSON-LD — maps status codes per the W3C VC Data Integrity spec.
  // statusPurpose: "revocation" covers both REVOKED and SUSPENDED states.
  const body = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://w3id.org/vc/status-list/2021/v1",
    ],
    id: `${appUrl}/api/certificates/${id}/status`,
    type: "StatusList2021Credential",
    issuer: appUrl,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: `${appUrl}/api/certificates/${id}/status#list`,
      type: "StatusList2021",
      statusPurpose: "revocation",
      // encodedList is intentionally a simple status map for this single credential.
      // A full StatusList2021 implementation would use a compressed bitstring for
      // privacy (hiding which positions are revoked). For this single-cert endpoint
      // we return a plain status descriptor instead — sufficient for Badge verifiers.
      certificationId: cert.id,
      certificateNumber: cert.certificateNumber,
      currentStatus: cert.status,
      isRevoked,
      isExpired,
      ...(cert.revokedAt && { revokedAt: cert.revokedAt.toISOString() }),
      ...(cert.expiresAt && { expiresAt: cert.expiresAt.toISOString() }),
    },
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Type": "application/ld+json",
    },
  });
}
