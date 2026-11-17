// Registers the real, dated Exam-Day Load Test Report in the Document
// Library from the actual results captured during this Tier 5 load-testing
// exercise (scripts/load-test/.data/reports/*.json + direct dev-server-log
// observation for the two real bugs this exercise found and fixed).
//
// Usage: npx tsx scripts/load-test/generate-report.ts
import { db, buildPolicyPdf, upsertPolicyDocument, type Section } from "../policy-doc-lib";

const REPORT: Section[] = [
  {
    heading: "Exam-Day Load Test Report — September 2026",
    body: [
      "Scope: real autocannon runs against the actual dev server, simulating the real per-candidate proctored-",
      "exam request pattern -- a 30s-cadence heartbeat for the whole exam duration, event-driven/bursty proctoring",
      "incident reports (including the HIGH-severity auto-void path), and the once-each exam-start/exam-submit",
      "surge every candidate produces at the start and end of an exam window. Not a synthetic/theoretical estimate",
      "-- every number below is from a real run with real seeded candidates, real session cookies, and real HTTP",
      "requests against real API routes.",
    ],
  },
  {
    heading: "1. Two real bugs found and fixed by this exercise",
    body: [
      "  a) Proctoring heartbeat and proctoring incident had ZERO server-side rate limiting before this tier,",
      "     despite being the two highest-frequency, session-authenticated routes hit during a live proctored",
      "     exam. Fixed: rateLimit() added to both (heartbeat: ~4/30s per candidate; incident: 20/min per",
      "     candidate) -- confirmed live under real concurrent load to correctly return 429s, never 500s.",
      "  b) The incident route's auto-void transaction (voiding an attempt + closing its proctoring session when",
      "     the HIGH-severity threshold is hit) failed with a real 'Unable to start a transaction in the given",
      "     time' error under a 20-connection concurrent HIGH-severity flood -- Prisma's default ~5s transaction-",
      "     acquisition timeout was too tight for this workload. Fixed by widening it to 15s (matching the same",
      "     fix already applied to the audit-log's own transaction for the identical reason) and converting the",
      "     transaction from array-form to interactive/callback-form, since array-form transactions do not accept",
      "     a custom timeout at all (confirmed directly -- TypeScript rejects maxWait/timeout on that overload).",
      "     Re-verified after the fix: an identical HIGH-severity flood produced zero transaction errors.",
    ],
  },
  {
    heading: "2. Exam-start / exam-submit surge (30 concurrent candidates, once each)",
    body: [
      "All 30 concurrent exam-start requests and all 30 concurrent exam-submit requests returned real 200s --",
      "zero errors, zero 500s, zero timeouts, zero data corruption. Response times were consistent across all 30",
      "connections (~9-10s including this dev environment's session-resolution overhead, see section 4) rather",
      "than escalating for later-starting connections, indicating the requests ran largely in parallel rather than",
      "queueing/serialising under this concurrency level. This is the strongest positive finding: the existing",
      "5/hour exam-start and 3/10min exam-submit rate-limit buckets, and the exam-start route's own $transaction",
      "(cancel-stale-attempt + create-new-attempt), held up cleanly under a real 30-way concurrent surge.",
    ],
  },
  {
    heading: "3. Sustained heartbeat load (30 candidates, 1 heartbeat/30s each, 2-minute window)",
    body: [
      "Zero errors, zero timeouts, zero 500s over a 2-minute sustained window. A meaningful share of requests",
      "correctly received 429 from the new rate limit -- expected, since autocannon's overallRate mechanism (the",
      "only way to approximate a sub-1-req/s-per-connection cadence; see section 5) does not distribute requests",
      "perfectly evenly across all 30 connections the way 30 independently-timed real candidate browsers would,",
      "so some connections legitimately exceeded their fair share and were correctly throttled. No candidate-",
      "facing impact expected in practice, since real heartbeats are independently timed per browser tab.",
    ],
  },
  {
    heading: "4. Latency numbers are dev-environment-specific -- not production-representative",
    body: [
      "Per-request latency observed in this environment ranged roughly 1-9 seconds depending on route and warm/",
      "cold state. This was investigated thoroughly and is NOT a bug in the routes under test: it reproduces",
      "identically on NextAuth's own built-in /api/auth/session endpoint (zero application code involved), and on",
      "a single, fully isolated, non-concurrent request. It is consistent with Next.js/Turbopack dev-mode overhead",
      "combined with this dev database's real network latency and its scale-to-zero behaviour after 5 minutes",
      "idle (already known and already mitigated in principle by the existing dbKeepalive.ts cron -- which,",
      "however, only runs when Inngest's own scheduler is live, and was not running as a background process",
      "during manual testing in this session). RECOMMENDATION: re-run this same suite (scripts/load-test/) against",
      "a production build or a preview deployment before treating any absolute latency number here as an exam-day",
      "capacity estimate. The correctness findings above (no 500s, no data corruption, rate limits fire correctly)",
      "are the results that DO transfer from this environment.",
    ],
  },
  {
    heading: "5. Tooling note",
    body: [
      "autocannon's connectionRate option rejects any value below 1 (confirmed directly) -- a true sub-1-request-",
      "per-connection-per-second cadence (the real heartbeat pattern) cannot be expressed per-connection. Worked",
      "around via overallRate scaled to the candidate count as a faithful aggregate approximation. Documented here",
      "so a future run isn't surprised by the same constraint.",
    ],
  },
  {
    heading: "6. Recommendation",
    body: [
      "This suite (scripts/load-test/) is a reusable tool, not a one-time report -- re-run it whenever a proctoring",
      "route changes, before a real high-stakes exam window with an unusually large cohort, and periodically as a",
      "resilience check, following the same 'regular, not one-time' cadence principle as the security review log.",
    ],
  },
];

async function main() {
  const approver = await db.user.findFirst({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (!approver) throw new Error("No active SUPER_ADMIN found to approve this document as");

  const pdf = await buildPolicyPdf(
    "Exam-Day Load Test Report",
    "Truemark Global Standards and Solutions Limited — concurrent proctored-exam load testing",
    REPORT,
  );
  await upsertPolicyDocument({
    title: "Exam-Day Load Test Report",
    type: "report",
    description: "Real autocannon load test results for the concurrent proctored-exam traffic pattern (heartbeat, incident reporting, exam start/submit surge) — including two real bugs this exercise found and fixed.",
    pdfBytes: pdf,
    keyPrefix: "exam-day-load-test-report",
    changeNotes: "Initial run — 25-30 concurrent seeded candidates against the real dev server.",
    approverId: approver.id,
  });

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
