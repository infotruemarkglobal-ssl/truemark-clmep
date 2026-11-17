import autocannon from "autocannon";
import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";

// autocannon's types use `export =` + a merged namespace (not named exports),
// so nested types are referenced as autocannon.X, not imported directly.
type Options = autocannon.Options;
type Result = autocannon.Result;

export const APP_URL = (process.env.LOAD_TEST_URL ?? "http://localhost:3001").replace(/\/$/, "");
const DATA_DIR = path.join(__dirname, ".data");

export type Candidate = { userId: string; attemptId: string; proctoringSessionId: string; cookie: string };
export type CandidateFile = { paperId: string; cookieName: string; candidates: Candidate[] };

export async function loadCandidates(): Promise<CandidateFile> {
  const raw = await readFile(path.join(DATA_DIR, "candidates.json"), "utf8");
  return JSON.parse(raw) as CandidateFile;
}

export function cookieHeader(cookieName: string, candidate: Candidate): string {
  return `${cookieName}=${candidate.cookie}`;
}

/**
 * A per-connection round-robin picker: call once inside setupClient() to get
 * the same Candidate for that connection's whole lifetime (one connection ==
 * one candidate throughout the test, matching how a real candidate holds one
 * session for their whole exam).
 */
export function roundRobinPicker(candidates: Candidate[]): () => Candidate {
  let i = 0;
  return () => {
    const candidate = candidates[i % candidates.length];
    i++;
    return candidate;
  };
}

export async function run(opts: Options): Promise<Result> {
  return new Promise((resolve, reject) => {
    // autocannon's own default timeout is 10s — too tight for this dev
    // environment's real observed per-request latency (Turbopack dev-mode +
    // NextAuth session resolution can genuinely take several seconds per
    // request here; confirmed directly, reproduces even on NextAuth's own
    // built-in /api/auth/session with zero app code involved — see the
    // Exam-Day Load Test Report for the full investigation). 30s avoids
    // conflating "the app is slow in dev" with "the request timed out."
    const instance = autocannon({ timeout: 30, ...opts }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: true });
  });
}

export function summarize(result: Result): string {
  return [
    `requests: ${result.requests.total} total, ${result.requests.average.toFixed(1)}/s avg`,
    `latency: p50=${result.latency.p50}ms p90=${result.latency.p90}ms p99=${result.latency.p99}ms max=${result.latency.max}ms`,
    `errors: ${result.errors}, timeouts: ${result.timeouts}, non2xx: ${result.non2xx}`,
    `duration: ${result.duration}s`,
  ].join("\n");
}

export async function saveReport(name: string, result: Result, extra: Record<string, unknown> = {}) {
  const reportsDir = path.join(DATA_DIR, "reports");
  await mkdir(reportsDir, { recursive: true });
  const file = path.join(reportsDir, `${name}-${Date.now()}.json`);
  await writeFile(file, JSON.stringify({ name, ...extra, result }, null, 2));
  return file;
}
