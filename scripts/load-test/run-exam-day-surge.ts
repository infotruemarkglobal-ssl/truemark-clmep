// Simulates the real once-each pattern: every candidate starts their exam
// attempt and, separately, submits it, all within a narrow window (the
// actual "exam day" surge) — not a sustained rate. Proves the existing
// exam-start (5/hr) and exam-submit (3/10min) rate-limit buckets tolerate a
// legitimate concurrent surge, and that N concurrent exam-start
// transactions don't exhaust the DB connection pool.
//
// Runs against FRESH attempts it creates itself (via the real POST /api/exams/[id]
// route, not the seeded IN_PROGRESS ones from seed-candidates.ts, since that
// route only allows starting when there's no existing active attempt).
//
// Usage: npx tsx scripts/load-test/run-exam-day-surge.ts
import { loadCandidates, cookieHeader, roundRobinPicker, run, summarize, saveReport, APP_URL } from "./lib";

async function main() {
  const { cookieName, candidates, paperId } = await loadCandidates();

  console.log(`\n=== Exam start surge: ${candidates.length} candidates starting concurrently ===`);
  const startPicker = roundRobinPicker(candidates);
  const startResult = await run({
    url: `${APP_URL}/api/exams/${paperId}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    connections: candidates.length,
    amount: candidates.length, // exactly one request per connection, then stop
    setupClient: (client) => {
      const candidate = startPicker();
      client.setHeadersAndBody({ Cookie: cookieHeader(cookieName, candidate) }, "{}");
    },
  });
  console.log(summarize(startResult));
  await saveReport("exam-start-surge", startResult, { candidates: candidates.length, paperId });

  console.log(`\n=== Exam submit surge: ${candidates.length} candidates submitting concurrently (their seeded attempts) ===`);
  const submitPicker = roundRobinPicker(candidates);
  const submitResult = await run({
    url: `${APP_URL}/api/exams/${paperId}/submit`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    connections: candidates.length,
    amount: candidates.length,
    setupClient: (client) => {
      const candidate = submitPicker();
      client.setHeadersAndBody({ Cookie: cookieHeader(cookieName, candidate) }, JSON.stringify({ responses: [] }));
    },
  });
  console.log(summarize(submitResult));
  await saveReport("exam-submit-surge", submitResult, { candidates: candidates.length, paperId });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
