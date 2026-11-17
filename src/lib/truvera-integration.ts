/**
 * The link to Truvera (the certification body's management system). Truvera READS from CLMEP; it never writes to CLMEP's database and
 * holds no candidate files, exam content or results. CLMEP stays the system of record for every person it certifies.
 *
 * Authentication is ONE shared secret for the body itself (env `TRUVERA_INTEGRATION_KEY`, at least 32 characters), sent by Truvera as
 * `Authorization: Bearer <key>`. It is compared in constant time, rate limited, and never logged. If the variable is not set the endpoint
 * answers 503, so nothing is exposed until the owner turns it on. This is separate from the organisation API keys on purpose: those are
 * scoped to one client organisation, this one is scoped to the body.
 *
 * Only what Truvera's register needs crosses the link: the certificate's own id, number, status, scheme, dates and the holder's NAME and
 * COUNTRY. Never an email address, date of birth, ID details, a revocation reason or any exam data.
 */
import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const MIN_KEY_LENGTH = 32;

export type TruveraAuth = { ok: true } | { ok: false; error: string; status: number };

const sha256 = (v: string): Buffer => createHash("sha256").update(v).digest();

export async function requireTruveraKey(req: NextRequest): Promise<TruveraAuth> {
  const configured = process.env.TRUVERA_INTEGRATION_KEY ?? "";
  if (configured.length < MIN_KEY_LENGTH) return { ok: false, error: "The Truvera integration is not configured", status: 503 };

  const header = req.headers.get("authorization");
  const given = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!given) return { ok: false, error: "Missing Authorization: Bearer <key> header", status: 401 };

  const limit = await rateLimit(getClientIp(req), "truvera-integration", { limit: 120, windowMs: 60_000 });
  if (!limit.success) return { ok: false, error: "Too many requests", status: 429 };

  // Compare digests, so the lengths always match and the comparison takes the same time for any input.
  if (!timingSafeEqual(sha256(given), sha256(configured))) return { ok: false, error: "Invalid key", status: 401 };
  return { ok: true };
}

export interface CertificateRow {
  id: string;
  certificateNumber: string;
  status: string;
  issuedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  standardVersion: string | null;
  schemeCodeSnapshot: string | null;
  schemeNameSnapshot: string | null;
  scheme: { code: string; name: string };
  user: { firstName: string; lastName: string; profile: { country: string | null } | null };
}

export interface BodyCertificate {
  /** The certificate's own id: stable across renewals (a renewal replaces the number on the same record). */
  id: string;
  certificateNumber: string;
  /** What CLMEP stores: ACTIVE, REVOKED or SUSPENDED. */
  status: string;
  /** True only while ACTIVE and not past its expiry: what a verifier would conclude today. */
  validNow: boolean;
  schemeCode: string;
  schemeName: string;
  standardVersion: string | null;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  holder: { name: string; country: string | null };
}

export function toBodyCertificate(c: CertificateRow, now: Date = new Date()): BodyCertificate {
  const expired = c.expiresAt !== null && c.expiresAt.getTime() < now.getTime();
  return {
    id: c.id,
    certificateNumber: c.certificateNumber,
    status: c.status,
    validNow: c.status === "ACTIVE" && !expired,
    // The names as they were when the certificate was issued, as the certificate itself says them.
    schemeCode: c.schemeCodeSnapshot ?? c.scheme.code,
    schemeName: c.schemeNameSnapshot ?? c.scheme.name,
    standardVersion: c.standardVersion,
    issuedAt: c.issuedAt.toISOString(),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    revokedAt: c.revokedAt?.toISOString() ?? null,
    holder: { name: `${c.user.firstName} ${c.user.lastName}`.trim(), country: c.user.profile?.country ?? null },
  };
}

export const DEFAULT_PAGE = 100;
export const MAX_PAGE = 200;
export const clampLimit = (raw: string | null): number => {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PAGE) : DEFAULT_PAGE;
};
