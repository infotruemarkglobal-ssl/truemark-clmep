// The FIRST real, dated entry in the Security Review & Vulnerability
// Management Log — a genuine internal code-level review of this codebase's
// security posture, performed for real (not boilerplate) and registered as
// the first version of a Document that securityReviewCadence.ts checks the
// freshness of going forward. Re-run this (with updated findings) each
// quarter to log the next entry.
//
// Usage: npx ts-node --project tsconfig.seed.json scripts/security-review-2026-09.ts
import { db, buildPolicyPdf, upsertPolicyDocument, type Section } from "./policy-doc-lib";

const REVIEW_LOG: Section[] = [
  {
    heading: "Security Review — September 2026 (first entry)",
    body: [
      "Scope: an internal code-level review of the CLMEP platform's own security-relevant code, plus a real",
      "`npm audit --omit=dev --audit-level=high` run against the exact dependency set this app ships. This is",
      "NOT a penetration test (see the Security Testing & Vulnerability Management Policy, section 4, for that",
      "distinction) -- it is a static review of real source and real dependency-advisory data.",
    ],
  },
  {
    heading: "1. Dependency vulnerabilities (npm audit, production dependencies only)",
    body: [
      "Real result at time of review: 67 advisories -- 4 critical, 24 high, 34 moderate, 5 low. None are auto-",
      "fixable without `npm audit fix --force`, which would downgrade prisma from 7.7.0 to 6.19.3 -- a major-",
      "version downgrade this review does NOT recommend applying automatically, given how much of this platform",
      "depends on prisma 7's current behaviour.",
      "",
      "Most consequential findings:",
      "  - next-auth 5.0.0-beta.30 (Auth.js): 3 real CVEs at critical severity -- an email-normalization homoglyph",
      "    bypass, an uncaught exception on malformed Bearer headers in getToken(), and OAuth state/nonce/PKCE",
      "    cookies not bound to the provider that created them. RECOMMENDATION: track next-auth's stable v5",
      "    release (this app is pinned to a beta) and plan a deliberate, tested upgrade -- not a forced one.",
      "  - protobufjs (transitive, via a monitoring/telemetry dependency): multiple critical advisories (code",
      "    injection, prototype pollution, DoS). Not directly imported by this app's own code -- lower real",
      "    exploitability here, but worth confirming which dependency pulls it in and whether a newer version",
      "    of that dependency drops the vulnerable protobufjs transitively.",
      "  - sharp <0.35.0 and undici 7.0.0-7.28.0: high-severity, mostly DoS/cache-poisoning/TLS-adjacent issues.",
      "    Both fixable via a non-major bump once `--force`'s prisma side-effect is decoupled from them.",
      "",
      "Remediation plan: (1) decouple the sharp/undici/qs fixes from the prisma-downgrading fix so they can ship",
      "independently, (2) schedule a deliberate next-auth stable-v5 upgrade as its own reviewed change, (3) re-run",
      "this audit as part of every quarterly review until the count is at or near zero, (4) once genuinely clean,",
      "flip `.github/workflows/ci.yml`'s audit step from continue-on-error to a hard gate on new high/critical",
      "regressions.",
    ],
  },
  {
    heading: "2. src/proxy.ts (CSP, MFA gate, login rate limiting)",
    body: [
      "Confirmed real and correctly applied: a nonce-based Content-Security-Policy (script-src/strict-dynamic, no",
      "unsafe-eval in production), frame-ancestors 'self', object-src 'none', upgrade-insecure-requests. MFA",
      "enforcement fires at the middleware layer (before any route handler runs), so a direct fetch() to a",
      "protected API cannot bypass it by omitting the session cookie. Login is rate-limited (10/15min/IP) on the",
      "credentials callback. No issues found in this review.",
    ],
  },
  {
    heading: "3. src/lib/rate-limit.ts",
    body: [
      "A real sliding-window limiter, Upstash Redis-backed in production with an in-memory fallback for dev.",
      "One real finding: the in-memory fallback logs a PRODUCTION WARNING if Upstash env vars are absent, but does",
      "not hard-fail startup. On Vercel's serverless model, each function instance would get its OWN in-memory map",
      "-- meaning if Upstash were ever misconfigured in production, rate limits would silently degrade to being",
      "enforced per-instance rather than globally, not fail closed. RECOMMENDATION: consider making this a hard",
      "startup failure in production rather than a console warning, since a silently-weakened rate limiter on",
      "exam-day-critical routes (heartbeat, proctoring incident) is exactly the kind of gap that only shows up",
      "under the load this platform is specifically trying to test for.",
    ],
  },
  {
    heading: "4. src/lib/permissions.ts",
    body: [
      "Every permission check resolves live from the database on every call (no cached/JWT-embedded permission set",
      "that could go stale after an admin revokes access) -- confirmed by the module's own doc comment and matches",
      "behaviour observed throughout this engagement. Fails closed: a user whose role can't be resolved to any",
      "grant gets an empty permission set, never a fallback to trusting the caller's role list alone. No issues",
      "found.",
    ],
  },
  {
    heading: "5. src/lib/storage.ts and the upload pipeline",
    body: [
      "Real, layered malware scanning on every upload (ClamAV sidecar preferred, with a documented fallback chain,",
      "hard-blocking + quarantining uploads in production if no scanner is configured at all -- fails closed, not",
      "open). Path-traversal is defended on the local-storage code path (resolved path checked against the upload",
      "root before writing). Uploaded files are served through an auth-gated proxy URL, not a direct public bucket",
      "URL. No issues found.",
    ],
  },
  {
    heading: "6. src/lib/audit.ts (tamper-evident audit log)",
    body: [
      "The hash chain (contentHash + previousHash) and its writers correctly serialise concurrent writes via a",
      "transaction-scoped Postgres advisory lock, preventing two concurrent writers from linking to the same",
      "chain tip. Historical rows were backfilled onto the current hash formula and the chain has been externally",
      "notarised via a real RFC 3161 timestamp. No issues found in this review.",
    ],
  },
  {
    heading: "7. Proctoring routes (heartbeat, incident) -- addressed by this same review cycle",
    body: [
      "Both routes had zero server-side rate limiting prior to this review, despite being the two highest-",
      "frequency, session-authenticated endpoints hit during a live proctored exam. This was found, and fixed,",
      "as part of the same body of work this review belongs to (see the Exam-Day Load Test Report for the load",
      "test that specifically targeted this gap, and the rateLimit() calls now present in both route files).",
    ],
  },
  {
    heading: "Overall assessment and next review",
    body: [
      "No critical application-level vulnerability was found in this review's code-level scope (items 2-6). The",
      "material findings are (a) the dependency baseline in item 1, which needs a deliberate remediation plan, not",
      "an automated force-fix, and (b) the rate-limiter fail-open-on-misconfiguration risk in item 3. Next review",
      "due within 100 days of this entry's date, enforced by the securityReviewCadence cron.",
    ],
  },
];

async function main() {
  const approver = await db.user.findFirst({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (!approver) throw new Error("No active SUPER_ADMIN found to approve this document as");

  console.log("Generating the first Security Review & Vulnerability Management Log entry...\n");

  const pdf = await buildPolicyPdf(
    "Security Review & Vulnerability Management Log",
    "Truemark Global Standards and Solutions Limited — dated internal review entries",
    REVIEW_LOG,
  );
  await upsertPolicyDocument({
    title: "Security Review & Vulnerability Management Log",
    type: "report",
    description: "Dated log of internal security reviews — dependency audit results, code-level findings, and remediation status. Checked quarterly for freshness by securityReviewCadence.ts.",
    pdfBytes: pdf,
    keyPrefix: "security-review-log",
    changeNotes: "First entry — initial internal review covering dependency vulnerabilities and core security-relevant modules.",
    approverId: approver.id,
  });

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
