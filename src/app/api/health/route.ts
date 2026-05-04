import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/health — liveness probe for Vercel health checks and uptime monitors.
// No authentication required — safe to call from external systems.
// Never exposes error messages, stack traces, or internal state in the response.

const DB_TIMEOUT_MS = 5_000;

export async function GET() {
  const timestamp = new Date().toISOString();
  const storage = (process.env.STORAGE_PROVIDER ?? "local") as "local" | "s3";

  const start = Date.now();
  let dbStatus: "connected" | "error" = "error";

  try {
    // Race the DB ping against a 5-second timeout.
    // $executeRaw returns a count; we discard the value.
    const ping = db.$executeRaw`SELECT 1`.then(() => true as const);
    const timeout = new Promise<false>((resolve) =>
      setTimeout(() => resolve(false), DB_TIMEOUT_MS),
    );
    const ok = await Promise.race([ping, timeout]);
    if (ok) dbStatus = "connected";
  } catch {
    // Intentionally swallowed — error detail stays server-side only.
    dbStatus = "error";
  }

  const latency_ms = Date.now() - start;
  const status = dbStatus === "connected" ? "ok" : "degraded";

  return NextResponse.json(
    { status, db: dbStatus, latency_ms, storage, timestamp },
    { status: dbStatus === "connected" ? 200 : 503 },
  );
}
