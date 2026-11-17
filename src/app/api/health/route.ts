import { NextResponse } from "next/server";
import { getHealthSnapshot } from "@/lib/health";

// GET /api/health — liveness probe for Vercel health checks and uptime monitors.
// No authentication required — safe to call from external systems.
// Never exposes error messages, stack traces, or internal state in the response.
//
// Kept as a thin wrapper over getHealthSnapshot() (src/lib/health.ts) so the
// public /status page and this route always report the exact same live
// state — response shape (status/db/latency_ms/storage/timestamp) is
// unchanged from before for existing consumers.
export async function GET() {
  const snapshot = await getHealthSnapshot();

  return NextResponse.json(
    {
      status: snapshot.status === "ok" ? "ok" : "degraded",
      db: snapshot.db.status,
      latency_ms: snapshot.db.latencyMs,
      storage: snapshot.storage.provider,
      timestamp: snapshot.timestamp,
    },
    { status: snapshot.db.status === "connected" ? 200 : 503 },
  );
}
