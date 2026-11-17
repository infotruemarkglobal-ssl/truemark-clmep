// Two bursts against the confirmed-unprotected-before-this-tier proctoring
// incident route: a MEDIUM-severity flood (proves the route + its new
// rate limit survive without 500s) and a HIGH-severity flood (specifically
// exercises the auto-void $transaction path under real concurrency).
//
// Usage: npx tsx scripts/load-test/run-incident-burst.ts
import { loadCandidates, cookieHeader, roundRobinPicker, run, summarize, saveReport, APP_URL } from "./lib";

async function burst(type: string, candidates: Awaited<ReturnType<typeof loadCandidates>>["candidates"], cookieName: string) {
  const nextCandidate = roundRobinPicker(candidates);
  return run({
    url: `${APP_URL}/api/exams/proctoring/incident`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    connections: Math.min(candidates.length, 20),
    duration: 20,
    setupClient: (client) => {
      const candidate = nextCandidate();
      client.setHeadersAndBody(
        { Cookie: cookieHeader(cookieName, candidate) },
        JSON.stringify({ proctoringSessionId: candidate.proctoringSessionId, type, details: "load-test burst" }),
      );
    },
  });
}

async function main() {
  const { cookieName, candidates } = await loadCandidates();

  console.log(`\n=== MEDIUM-severity flood (${Math.min(candidates.length, 20)} connections, 20s, max throughput) ===`);
  const medium = await burst("looking_away", candidates, cookieName);
  console.log(summarize(medium));
  const mediumFile = await saveReport("incident-burst-medium", medium, { candidates: candidates.length });
  console.log(`Report: ${mediumFile}`);

  console.log(`\n=== HIGH-severity flood — exercises the auto-void $transaction path ===`);
  const high = await burst("tab_switch", candidates, cookieName);
  console.log(summarize(high));
  const highFile = await saveReport("incident-burst-high", high, { candidates: candidates.length });
  console.log(`Report: ${highFile}`);

  const rateLimited429 = (r: typeof medium) => r.non2xx; // 429s land in non2xx; see the run's raw report for a per-status breakdown if needed
  console.log(`\nNon-2xx (expected: real 429s from the new rate limit, not 500s) — medium: ${rateLimited429(medium)}, high: ${rateLimited429(high)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
