import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

const INCIDENT_TYPES = [
  "tab_switch", "fullscreen_exit", "copy_paste", "suspicious_movement",
  "audio_detected", "face_not_visible", "multiple_faces",
  "camera_denied", "camera_blocked", "navigation_attempt",
  "navigation_exit", "looking_away", "talking_detected",
  "window_switch", "other",
] as const;

// HIGH severity types count against the tabSwitchLimit enforced server-side
const HIGH_SEVERITY_TYPES = new Set<string>([
  "tab_switch", "multiple_faces", "camera_blocked", "camera_denied",
  "navigation_attempt", "navigation_exit", "window_switch",
]);

const MEDIUM_SEVERITY_TYPES = new Set<string>([
  "face_not_visible", "fullscreen_exit", "looking_away", "talking_detected",
]);

const schema = z.object({
  proctoringSessionId: z.string(),
  type: z.enum(INCIDENT_TYPES),
  details: z.string().max(500).optional(),
  // Client timestamp is informational only — server always writes its own
  timestamp: z.string().optional(),
});

// POST /api/exams/proctoring/incident — log a proctoring incident
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The real client fires these event-driven and can burst (e.g. rapid
  // tab-switching, each debounced ~1.5s) — 20/min comfortably tolerates a
  // real burst while hard-stopping a scripted flood. This is also where the
  // HIGH-severity auto-void $transaction lives, so an unthrottled flood was
  // both a cost and a correctness risk, not just noise. Discovered
  // unprotected during the Tier 5 exam-day load-testing exercise.
  const rl = await rateLimit(session.user.id, "proctoring-incident", { limit: 20, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { proctoringSessionId, type, details } = body.data;

  // Verify the proctoring session belongs to this user via the attempt,
  // and fetch the exam paper so we can enforce tabSwitchLimit server-side.
  const proctoringSession = await db.proctoringSession.findUnique({
    where: { id: proctoringSessionId },
    include: {
      attempt: {
        select: {
          id: true,
          userId: true,
          status: true,
          examPaperId: true,
          examPaper: { select: { tabSwitchLimit: true } },
        },
      },
    },
  });

  if (!proctoringSession) {
    return NextResponse.json({ error: "Proctoring session not found" }, { status: 404 });
  }
  if (proctoringSession.attempt.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (proctoringSession.attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Exam not in progress" }, { status: 409 });
  }

  // Assign severity server-side — the client cannot escalate or downgrade
  const severity = HIGH_SEVERITY_TYPES.has(type)
    ? "high"
    : MEDIUM_SEVERITY_TYPES.has(type)
      ? "medium"
      : "low";

  await db.proctoringIncident.create({
    data: {
      sessionId: proctoringSessionId,
      type,
      severity,
      description: details ?? null,
      timestamp: new Date(),
    },
  });

  // This auto-void is a real-time circuit-breaker, not the final word — a
  // Certification Officer can review and reverse it via
  // PATCH /api/manage/exams/attempts/[id]/reinstate (ISO/IEC 17024:2026
  // human-oversight requirement for AI-assisted assessment decisions).
  // HIGH fix: enforce tabSwitchLimit server-side — client JS can be bypassed via
  // DevTools (setting tabViolationsRef.current = 0). Count HIGH-severity incidents
  // persisted in the DB and void the attempt if the limit is reached.
  const tabSwitchLimit = proctoringSession.attempt.examPaper?.tabSwitchLimit ?? 3;
  if (HIGH_SEVERITY_TYPES.has(type)) {
    const highCount = await db.proctoringIncident.count({
      where: {
        sessionId: proctoringSessionId,
        severity: "high",
      },
    });

    if (highCount >= tabSwitchLimit) {
      // Void the attempt and close the proctoring session atomically. Uses
      // the interactive (callback) form specifically so maxWait/timeout can
      // be widened — the array form only accepts { isolationLevel } and
      // can't be given a longer timeout at all (confirmed directly: TS
      // rejects maxWait/timeout on the array-form overload). This route has
      // no PgBouncer array-form requirement (unlike the payment/certificate/
      // GDPR routes that deliberately stay array-form for that reason).
      //
      // The widened timeout itself was discovered necessary via Tier 5 load
      // testing: Prisma's default ~5s transaction-acquisition timeout is too
      // tight when many candidates trip the auto-void threshold concurrently
      // (a real "Unable to start a transaction in the given time" error
      // under a 20-connection HIGH-severity flood) — same fix already
      // applied to src/lib/audit.ts's transaction for the same reason.
      await db.$transaction(
        async (tx) => {
          await tx.examAttempt.update({
            where: { id: proctoringSession.attempt.id },
            data: { status: "VOIDED" },
          });
          await tx.proctoringSession.update({
            where: { id: proctoringSessionId },
            data: { status: "terminated", endedAt: new Date() },
          });
        },
        { maxWait: 15_000, timeout: 15_000 },
      );

      await auditLog({
        userId: session.user.id,
        action: "EXAM_VOIDED_VIOLATIONS",
        entityType: "ExamAttempt",
        entityId: proctoringSession.attempt.id,
        metadata: {
          triggeringIncidentType: type,
          highSeverityCount: highCount,
          tabSwitchLimit,
          proctoringSessionId,
        },
      });

      return NextResponse.json({ ok: true, terminated: true });
    }
  }

  return NextResponse.json({ ok: true, terminated: false });
}
