import { randomBytes, createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const API_KEY_SCOPES = ["members:read", "certificates:read"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const KEY_PREFIX = "tmg_live_";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Generates a new key. Returns the raw key ONLY here — never persisted or logged in plaintext. */
export function generateApiKey(): { rawKey: string; hashedKey: string; keyPrefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const rawKey = `${KEY_PREFIX}${secret}`;
  return { rawKey, hashedKey: sha256(rawKey), keyPrefix: rawKey.slice(0, 12) };
}

type AuthResult =
  | { ok: true; organisationId: string; scopes: ApiKeyScope[] }
  | { ok: false; error: string; status: number };

/**
 * Authenticates an inbound `Authorization: Bearer <key>` request for the
 * public v1 API. Rate-limited the same way every other endpoint in this
 * codebase is (src/lib/rate-limit.ts's shared bucket API) — keyed by the
 * key's own id once resolved, falling back to client IP for a not-found key
 * so a guessing attack can't bypass the limit by trying a new fake key each time.
 */
export async function requireApiKey(req: NextRequest, requiredScope: ApiKeyScope): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  const rawKey = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  if (!rawKey) return { ok: false, error: "Missing Authorization: Bearer <key> header", status: 401 };

  const ip = getClientIp(req);
  const ipLimit = await rateLimit(ip, "api-key-auth", { limit: 60, windowMs: 60_000 });
  if (!ipLimit.success) {
    return { ok: false, error: "Too many requests", status: 429 };
  }

  const hashedKey = sha256(rawKey);
  const key = await db.apiKey.findUnique({ where: { hashedKey } });
  if (!key || key.revokedAt) return { ok: false, error: "Invalid or revoked API key", status: 401 };

  // Constant-time compare of the hash we just computed against the stored
  // one — belt-and-braces on top of the DB's own equality lookup, since the
  // lookup already had to match exactly to return a row at all.
  const stored = Buffer.from(key.hashedKey, "hex");
  const computed = Buffer.from(hashedKey, "hex");
  if (stored.length !== computed.length || !timingSafeEqual(stored, computed)) {
    return { ok: false, error: "Invalid or revoked API key", status: 401 };
  }

  const keyLimit = await rateLimit(key.id, "api-key-request", { limit: 300, windowMs: 60_000 });
  if (!keyLimit.success) {
    return { ok: false, error: "Too many requests. Please try again later.", status: 429 };
  }

  const scopes = JSON.parse(key.scopes) as ApiKeyScope[];
  if (!scopes.includes(requiredScope)) {
    return { ok: false, error: `This API key does not have the "${requiredScope}" scope`, status: 403 };
  }

  db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { ok: true, organisationId: key.organisationId, scopes };
}
