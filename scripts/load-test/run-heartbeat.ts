// Simulates the real, sustained per-candidate proctoring load: 1 heartbeat
// every 30s, for every candidate, for the whole exam duration. Run for a
// representative window (default 5 min), not the full 2h — this is enough
// to prove steady-state connection-pool/rate-limit behaviour without a
// multi-hour run.
//
// Usage: npx tsx scripts/load-test/run-heartbeat.ts [durationSeconds]
import { loadCandidates, cookieHeader, roundRobinPicker, run, summarize, saveReport, APP_URL } from "./lib";

async function main() {
  const duration = Number(process.argv[2] ?? 300);
  const { cookieName, candidates } = await loadCandidates();

  // The real per-candidate cadence is 1 request/30s, but autocannon's
  // connectionRate rejects anything below 1 (confirmed directly — it throws
  // "connectionRate can not be less than 1"), so a true sub-1 per-connection
  // rate isn't expressible. Approximate the real AGGREGATE rate instead via
  // overallRate (candidates/30, minimum 1) — for the realistic candidate
  // counts this is meant to be run at (dozens to low hundreds), this is a
  // faithful stand-in for "every candidate heartbeats roughly every 30s."
  const overallRate = Math.max(1, Math.round(candidates.length / 30));
  console.log(`Running heartbeat load test: ${candidates.length} connections, ~${overallRate} req/s aggregate (≈1/30s per candidate), ${duration}s duration...`);

  // One connection == one candidate for the connection's whole lifetime, so
  // the cookie + body assigned at setup time stay correct for every request
  // that connection makes (no per-request re-assignment needed).
  const nextCandidate = roundRobinPicker(candidates);
  const result = await run({
    url: `${APP_URL}/api/exams/proctoring/heartbeat`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    connections: candidates.length,
    overallRate,
    duration,
    setupClient: (client) => {
      const candidate = nextCandidate();
      client.setHeadersAndBody(
        { Cookie: cookieHeader(cookieName, candidate) },
        JSON.stringify({ proctoringSessionId: candidate.proctoringSessionId }),
      );
    },
  });

  console.log("\n" + summarize(result));
  const file = await saveReport("heartbeat", result, { candidates: candidates.length, duration });
  console.log(`\nReport saved to ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
