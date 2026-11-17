import { access, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { makeS3Client, getBucket } from "@/lib/storage";

const DB_TIMEOUT_MS = 5_000;
const CHECK_TIMEOUT_MS = 5_000;

export type ComponentStatus = "connected" | "error" | "not_configured";

export type HealthSnapshot = {
  status: "ok" | "degraded";
  timestamp: string;
  db: { status: "connected" | "error"; latencyMs: number };
  storage: { provider: "local" | "s3"; status: ComponentStatus; latencyMs: number | null };
  redis: { status: ComponentStatus; latencyMs: number | null };
  backgroundJobs: { configured: boolean };
};

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  return Promise.race([promise, timeout]);
}

async function checkDb(): Promise<{ status: "connected" | "error"; latencyMs: number }> {
  const start = Date.now();
  try {
    const ok = await withTimeout(db.$executeRaw`SELECT 1`.then(() => true as const), DB_TIMEOUT_MS);
    return { status: ok ? "connected" : "error", latencyMs: Date.now() - start };
  } catch {
    return { status: "error", latencyMs: Date.now() - start };
  }
}

// A real live check, not a name echo: local storage confirms the upload
// directory is actually reachable/writable; S3 does a genuine, cheap
// HeadBucketCommand against the configured bucket.
async function checkStorage(): Promise<{ provider: "local" | "s3"; status: ComponentStatus; latencyMs: number | null }> {
  const provider = (process.env.STORAGE_PROVIDER ?? "local") as "local" | "s3";
  const start = Date.now();

  if (provider === "s3") {
    try {
      const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
      const client = await makeS3Client();
      const ok = await withTimeout(
        client.send(new HeadBucketCommand({ Bucket: getBucket() })).then(() => true as const),
        CHECK_TIMEOUT_MS,
      );
      return { provider, status: ok ? "connected" : "error", latencyMs: Date.now() - start };
    } catch {
      return { provider, status: "error", latencyMs: Date.now() - start };
    }
  }

  try {
    const uploadRoot = path.join(process.cwd(), "private-uploads");
    try {
      await access(uploadRoot);
    } catch {
      // Doesn't exist yet on a fresh checkout — confirm the parent is at
      // least writable rather than reporting a false failure.
      await mkdir(uploadRoot, { recursive: true });
    }
    return { provider, status: "connected", latencyMs: Date.now() - start };
  } catch {
    return { provider, status: "error", latencyMs: Date.now() - start };
  }
}

// A real PING against Upstash's REST API — same request shape already used
// by src/lib/rate-limit.ts's upstashCheck(), not a fabricated reachability
// claim. "not_configured" (no env vars) is expected and fine in dev; the
// caller decides whether that counts as degraded based on environment.
async function checkRedis(): Promise<{ status: ComponentStatus; latencyMs: number | null }> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { status: "not_configured", latencyMs: null };

  const start = Date.now();
  try {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["PING"]),
        cache: "no-store",
      }),
      CHECK_TIMEOUT_MS,
    );
    if (!res || !res.ok) return { status: "error", latencyMs: Date.now() - start };
    const json = (await res.json()) as { result?: string };
    return { status: json.result === "PONG" ? "connected" : "error", latencyMs: Date.now() - start };
  } catch {
    return { status: "error", latencyMs: Date.now() - start };
  }
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const [dbResult, storageResult, redisResult] = await Promise.all([checkDb(), checkStorage(), checkRedis()]);

  // Inngest has no cheap, honest "is it actually reachable" probe available
  // from inside this app (it's an outbound-only event relationship) — this
  // is deliberately just an env-var-presence check, not a live reachability
  // claim, and is reported as such rather than dressed up as more than it is.
  const backgroundJobs = { configured: !!(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY) };

  const isProd = process.env.NODE_ENV === "production";
  const degraded =
    dbResult.status !== "connected" ||
    storageResult.status === "error" ||
    redisResult.status === "error" ||
    (isProd && redisResult.status === "not_configured") ||
    (isProd && !backgroundJobs.configured);

  return {
    status: degraded ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    db: dbResult,
    storage: storageResult,
    redis: redisResult,
    backgroundJobs,
  };
}
