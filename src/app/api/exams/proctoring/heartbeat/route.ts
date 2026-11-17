import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  proctoringSessionId: z.string(),
});

// POST /api/exams/proctoring/heartbeat — keep proctoring session alive
// Called every 30 s by ExamInterface. If the server stops receiving heartbeats
// (e.g. browser crash or network drop) the session's updatedAt timestamp
// becomes stale, allowing the SLA monitor to flag orphaned attempts.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Real cadence is 1/30s per candidate — this is generous headroom for
  // jitter/retries without opening the door to a scripted flood. Discovered
  // unprotected during the Tier 5 exam-day load-testing exercise.
  const rl = await rateLimit(session.user.id, "proctoring-heartbeat", { limit: 4, windowMs: 30_000 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { proctoringSessionId } = body.data;

  const proctoringSession = await db.proctoringSession.findUnique({
    where: { id: proctoringSessionId },
    include: { attempt: { select: { userId: true, status: true } } },
  });

  if (!proctoringSession) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (proctoringSession.attempt.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (proctoringSession.attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ ok: false, terminated: true });
  }

  return NextResponse.json({ ok: true, terminated: false });
}
