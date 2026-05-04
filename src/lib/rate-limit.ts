/**
 * Production-ready rate limiter — sliding window, two backends.
 *
 * ── BACKENDS ──────────────────────────────────────────────────────────────────
 *
 * 1. Upstash Redis REST (production)
 *    Uses the Upstash HTTP REST API directly — no npm package required.
 *    Atomic Lua script; sliding window; shared across all serverless instances.
 *
 *    Required env vars:
 *      UPSTASH_REDIS_REST_URL   = https://your-db.upstash.io
 *      UPSTASH_REDIS_REST_TOKEN = AXxx...
 *
 *    Create a free Redis database at https://upstash.com and copy the
 *    REST URL + token from the console.
 *
 * 2. In-memory Map (local dev / CI)
 *    Per-process; resets on every cold start. Useless across multiple
 *    serverless instances — a hard warning is logged if NODE_ENV=production
 *    and UPSTASH_REDIS_REST_URL is not configured.
 *
 * ── IP EXTRACTION ─────────────────────────────────────────────────────────────
 *
 * Use getClientIp(req) for every IP-keyed bucket. The function reads:
 *   1. x-real-ip  — set by Vercel's edge network; cannot be spoofed by clients.
 *   2. x-forwarded-for (leftmost)  — Vercel prepends the real client IP here;
 *      leftmost is correct only because Vercel controls this header.
 *
 * NEVER pass req.headers.get("x-forwarded-for")?.split(",")[0] directly —
 * on a deployment where multiple untrusted proxies are in the chain, the
 * leftmost value is attacker-controlled.
 *
 * ── RETRY-AFTER ───────────────────────────────────────────────────────────────
 *
 * Every caller MUST set the Retry-After header on 429 responses (RFC 6585 §4):
 *
 *   const rl = await rateLimit(ip, "login", { limit: 10, windowMs: 15 * 60_000 });
 *   if (!rl.success) {
 *     return NextResponse.json(
 *       { error: "Too many requests" },
 *       { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
 *     );
 *   }
 */

import type { NextRequest } from "next/server";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Seconds until the window slides enough to allow a new request. 0 when success. */
  retryAfterSecs: number;
}

// ─── IP extraction ─────────────────────────────────────────────────────────────

/**
 * Returns the real client IP from an incoming Next.js request.
 *
 * Priority:
 *   x-real-ip     — Vercel's edge sets this to the connecting client IP.
 *                   It cannot be spoofed because Vercel overwrites it.
 *   x-forwarded-for (leftmost)
 *                 — Vercel *prepends* the client IP to this header, so the
 *                   leftmost value is the real client address on Vercel
 *                   deployments. Not reliable on custom multi-proxy setups.
 *
 * If neither header is present the request is not behind a proxy we recognise
 * (e.g. direct TCP on localhost). Return "unknown" and let the caller decide
 * whether to block or allow.
 */
export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }

  return "unknown";
}

// ─── Upstash Redis backend (HTTP REST, no npm package needed) ─────────────────
//
// Atomic Lua script — evaluated by Redis in a single round-trip:
//   1. Remove all requests older than the window (ZREMRANGEBYSCORE).
//   2. Count remaining (ZCARD).
//   3. If under the limit: record this request (ZADD) + refresh the TTL.
//   4. Return [allowed, remaining, reset_timestamp_ms].
//
// The unique `member` value (timestamp + random suffix) prevents two concurrent
// requests with the same millisecond timestamp from being deduplicated by Redis.

const SLIDING_WINDOW_LUA = `
local key    = KEYS[1]
local win_ms = tonumber(ARGV[1])
local lim    = tonumber(ARGV[2])
local now    = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - win_ms)
local count = redis.call('ZCARD', key)
if count < lim then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, win_ms + 5000)
  return {1, lim - count - 1, now + win_ms}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local reset  = (oldest[2] ~= nil) and (tonumber(oldest[2]) + win_ms) or (now + win_ms)
return {0, 0, reset}
`.trim();

// Cached connection test result so we don't warn on every request
let _upstashReachable: boolean | null = null;

async function upstashCheck(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const now    = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 9)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // Single pipeline call: ["EVAL", script, numkeys, key, arg1, arg2, arg3, arg4]
      body: JSON.stringify([
        "EVAL", SLIDING_WINDOW_LUA, "1",
        key,
        String(windowMs),
        String(limit),
        String(now),
        member,
      ]),
      // Must not be cached — rate limit checks must always hit the live state.
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[rate-limit] Upstash returned HTTP ${res.status}`);
      return null; // fail open — do not block the request on infrastructure error
    }

    const json = await res.json() as { result: [number, number, number] };
    const [allowed, remaining, resetMs] = json.result;
    _upstashReachable = true;

    return {
      success:       allowed === 1,
      remaining,
      retryAfterSecs: allowed === 1 ? 0 : Math.max(0, Math.ceil((resetMs - now) / 1000)),
    };
  } catch (err) {
    // Network error (Upstash unreachable) — fail open with a warning.
    // Blocking all traffic because the rate-limit store is down would be
    // worse than letting a few extra requests through.
    if (_upstashReachable !== false) {
      console.error("[rate-limit] Upstash request failed — falling back to in-memory:", err);
      _upstashReachable = false;
    }
    return null;
  }
}

// ─── In-memory fallback (single instance only) ─────────────────────────────────

type MemEntry = { count: number; resetAt: number };
const _memStore = new Map<string, MemEntry>();

// Prune stale entries every 5 minutes so the Map doesn't grow unbounded
// in long-running Node.js processes (dev / self-hosted).
// .unref() means this timer won't prevent process exit.
if (typeof setInterval !== "undefined") {
  const pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of _memStore) {
      if (e.resetAt < now) _memStore.delete(k);
    }
  }, 5 * 60_000);
  // setInterval in Edge Runtime doesn't have .unref(); guard the call.
  if (typeof pruneTimer === "object" && pruneTimer !== null && "unref" in pruneTimer) {
    (pruneTimer as NodeJS.Timeout).unref();
  }
}

function memCheck(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let entry = _memStore.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    _memStore.set(key, entry);
  }

  entry.count++;
  const success = entry.count <= limit;

  return {
    success,
    remaining:      Math.max(0, limit - entry.count),
    retryAfterSecs: success ? 0 : Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Check a rate limit bucket and record the attempt.
 *
 * @param identifier  Per-user or per-IP key (use getClientIp() for anonymous routes).
 * @param bucket      Logical name for this limit (e.g. "login", "forgot-password").
 * @param options     limit — max requests allowed in the window.
 *                    windowMs — sliding window length in milliseconds.
 * @returns           { success, remaining, retryAfterSecs }
 *                    Always set Retry-After: retryAfterSecs on 429 responses.
 */
export async function rateLimit(
  identifier: string,
  bucket: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const key = `rl:${bucket}:${identifier}`;

  // 1. Try Upstash Redis (shared across all serverless instances)
  const redisResult = await upstashCheck(key, limit, windowMs);
  if (redisResult !== null) return redisResult;

  // 2. In-memory fallback
  if (process.env.NODE_ENV === "production" && !process.env.UPSTASH_REDIS_REST_URL) {
    // Log once per process boot so this doesn't spam every request
    if (!_warnedMemory) {
      console.error(
        "[rate-limit] PRODUCTION WARNING: UPSTASH_REDIS_REST_URL is not set.\n" +
        "Rate limiting is using an in-process Map that is NOT shared across\n" +
        "serverless function instances. An attacker can trivially bypass all\n" +
        "limits by sending parallel requests that land on different instances.\n" +
        "Fix: create a free Upstash Redis DB at https://upstash.com and set\n" +
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your env.",
      );
      _warnedMemory = true;
    }
  }

  return memCheck(key, limit, windowMs);
}

let _warnedMemory = false;
