import crypto from "crypto";
import { db } from "@/lib/db";
import { CERT_NUMBER_PREFIX } from "@/lib/constants";
import { SignJWT, importPKCS8 } from "jose";
import QRCode from "qrcode";

// ─── Certificate number TG-YYYY-{8 random hex chars} ─────────────────────────
// CRITICAL fix: the previous sequential format (TG-2025-000001) was enumerable —
// an attacker could iterate from 1 to N to discover all certificate holders.
// Random 4-byte suffix (8 hex chars = 32 bits) makes enumeration infeasible
// while remaining human-readable for official records.
// On collision (1-in-4-billion chance) we retry once.
export async function generateCertificateNumber(): Promise<string> {
  const year = new Date().getFullYear();

  async function attempt(): Promise<string> {
    const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
    const candidate = `${CERT_NUMBER_PREFIX}-${year}-${rand}`;
    const existing = await db.certificate.findUnique({
      where: { certificateNumber: candidate },
      select: { id: true },
    });
    if (existing) return attempt(); // retry on collision
    return candidate;
  }

  return attempt();
}

// ─── Open Badges 3.0 JWT credential ──────────────────────────────────────────
//
// Signing strategy:
//   RS256 (preferred, OB3.0-conformant) — requires CERT_SIGNING_PRIVATE_KEY env
//   var containing a PKCS#8 PEM private key. The matching public key must be
//   published at /api/certificates/jwks for verifiers to check signatures without
//   sharing a secret. Generate a key pair with:
//     openssl genrsa -out cert_signing.pem 2048
//     openssl pkcs8 -topk8 -nocrypt -in cert_signing.pem -out cert_signing_pkcs8.pem
//     openssl rsa -in cert_signing.pem -pubout -out cert_signing_pub.pem
//   Set CERT_SIGNING_PRIVATE_KEY to the contents of cert_signing_pkcs8.pem.
//
//   HS256 (fallback) — uses AUTH_SECRET (symmetric). Any party knowing the
//   secret can forge a badge. Not OB3.0-conformant for external verifiers.
//   Only acceptable in development; env.ts enforces AUTH_SECRET is strong in prod.

export async function generateOpenBadgeJwt(opts: {
  certificateId: string;
  certificateNumber: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  schemeName: string;
  schemeCode: string;
  issuedAt: Date;
  expiresAt: Date | null;
}): Promise<{ json: string; jwt: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const credential = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    id: `${appUrl}/api/certificates/${opts.certificateId}`,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    issuer: {
      id: `${appUrl}`,
      type: "Profile",
      name: "Truemark Global — Standards & Solutions Limited",
      url: appUrl,
      email: "certifications@truemarkglobal.com",
    },
    issuanceDate: opts.issuedAt.toISOString(),
    ...(opts.expiresAt ? { expirationDate: opts.expiresAt.toISOString() } : {}),
    credentialSubject: {
      id: `${appUrl}/candidates/${opts.candidateId}`,
      type: ["AchievementSubject"],
      identifier: [{ type: "IdentityObject", identityHash: opts.candidateEmail, identityType: "email" }],
      achievement: {
        id: `${appUrl}/schemes/${opts.schemeCode}`,
        type: ["Achievement"],
        name: opts.schemeName,
        description: `Personnel certification in ${opts.schemeName} issued by Truemark Global under ISO/IEC 17024.`,
        criteria: { narrative: `Candidate successfully completed all requirements for ${opts.schemeName} certification.` },
        issuer: { id: `${appUrl}`, type: "Profile", name: "Truemark Global" },
      },
      result: [{ type: ["Result"], resultDescription: opts.schemeName, status: "Completed" }],
    },
    // StatusList2021Entry for revocation checking — implement GET handler at this URL
    credentialStatus: {
      id: `${appUrl}/api/certificates/${opts.certificateId}/status`,
      type: "StatusList2021Entry",
      statusPurpose: "revocation",
    },
  };

  const json = JSON.stringify(credential, null, 2);

  // Build the JWT builder common to both signing strategies
  let jwtBuilder = new SignJWT({ vc: credential })
    .setIssuedAt(Math.floor(opts.issuedAt.getTime() / 1000))
    .setIssuer(appUrl)
    .setSubject(opts.candidateId)
    .setJti(opts.certificateId);

  // CRITICAL fix: set JWT expiration so the token itself reflects cert expiry.
  // Without this, a revoked/expired cert's JWT remains cryptographically valid
  // forever — any verifier that trusts the JWT signature without checking the
  // credentialStatus endpoint would accept it.
  if (opts.expiresAt) {
    jwtBuilder = jwtBuilder.setExpirationTime(Math.floor(opts.expiresAt.getTime() / 1000));
  }

  let jwt: string;
  const rsaPrivateKeyPem = process.env.CERT_SIGNING_PRIVATE_KEY;

  if (rsaPrivateKeyPem) {
    // RS256 — OB3.0-conformant asymmetric signing. Verifiers use the JWKS
    // endpoint to validate without sharing a secret.
    const privateKey = await importPKCS8(rsaPrivateKeyPem, "RS256");
    jwt = await jwtBuilder
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "cert-signing-key-1" })
      .sign(privateKey);
  } else {
    // HS256 fallback — symmetric, development only. env.ts enforces AUTH_SECRET
    // strength in production, but this algorithm is NOT suitable for external
    // verification because the verifier would need the shared secret.
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    jwt = await jwtBuilder
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(secret);
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[certificates] CERT_SIGNING_PRIVATE_KEY not set — falling back to HS256. " +
        "This is not OB3.0-conformant. Set CERT_SIGNING_PRIVATE_KEY in production."
      );
    }
  }

  return { json, jwt };
}

// ─── QR Code (data URL) ───────────────────────────────────────────────────────
export async function generateQrCode(certificateNumber: string): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${appUrl}/verify/${certificateNumber}`;
  return QRCode.toDataURL(url, { margin: 1, width: 200, color: { dark: "#064e3b", light: "#ffffff" } });
}
