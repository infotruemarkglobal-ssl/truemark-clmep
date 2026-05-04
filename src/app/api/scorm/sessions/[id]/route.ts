import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

// ── Allowed completion status values ─────────────────────────────────────────
// SCORM 1.2 cmi.core.lesson_status: passed | completed | failed | incomplete | not attempted | browsed
// SCORM 2004 cmi.completion_status: completed | incomplete | not attempted | unknown
// We accept the union so a single session handler covers both standards.
const COMPLETION_STATUSES = [
  "not attempted",
  "incomplete",
  "completed",
  "failed",
  "passed",
  "browsed",   // SCORM 1.2 only
  "unknown",   // SCORM 2004 only
] as const;

// SCORM 2004 cmi.success_status — SCORM 1.2 conflates pass/fail into lesson_status
const SUCCESS_STATUSES = ["passed", "failed", "unknown"] as const;

const schema = z.object({
  completionStatus: z.enum(COMPLETION_STATUSES).optional(),
  successStatus: z.enum(SUCCESS_STATUSES).optional().nullable(),
  // Score fields: SCORM spec defines the valid range as [scoreMin, scoreMax].
  // We cap all three at [0, 100] — no legitimate SCORM package reports a raw
  // score above 100 % or negative; values outside this range indicate tampering.
  scoreRaw: z.number().min(0).max(100).optional().nullable(),
  scoreMin: z.number().min(0).max(100).optional().nullable(),
  scoreMax: z.number().min(0).max(100).optional().nullable(),
  // HH:MM:SS (SCORM 1.2) or ISO 8601 duration (SCORM 2004) — cap at 20 chars
  totalTime: z.string().max(20).optional().nullable(),
  // SCORM 1.2 spec: max 4 096 chars; SCORM 2004: max 64 000 chars.
  // We accept up to 64 000 to be 2004-compatible while preventing storage abuse.
  suspendData: z.string().max(64_000).optional().nullable(),
  entry: z.enum(["ab-initio", "resume", ""]).optional(),
  cmiData: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const scormSession = await db.sCORMSession.findUnique({ where: { id } });
  if (!scormSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scormSession.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ...scormSession,
    cmiData: scormSession.cmiData ? JSON.parse(scormSession.cmiData) : {},
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // SCORM content auto-commits every 30 s during playback (LMSCommit / Commit).
  // 200 commits/hour ≈ 3.3 h of uninterrupted play — ample for legitimate learners.
  // Scripted score-inflation loops would exhaust this within seconds.
  const commitRl = await rateLimit(session.user.id, "scorm-commit", { limit: 200, windowMs: 60 * 60_000 });
  if (!commitRl.success) {
    return NextResponse.json(
      { error: "Too many commit requests. Please resume your session later." },
      { status: 429, headers: { "Retry-After": String(commitRl.retryAfterSecs) } },
    );
  }

  const { id } = await params;
  const scormSession = await db.sCORMSession.findUnique({ where: { id } });
  if (!scormSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scormSession.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { cmiData, scoreRaw, scoreMin, scoreMax, ...rest } = body.data;

  // ── Score bounds validation ───────────────────────────────────────────────
  // scoreRaw must lie within [scoreMin, scoreMax].
  // When the bounds are not included in this commit, fall back to the values
  // already stored on the session (defaulting to the SCORM spec range 0–100).
  if (scoreRaw !== null && scoreRaw !== undefined) {
    const min = scoreMin ?? scormSession.scoreMin ?? 0;
    const max = scoreMax ?? scormSession.scoreMax ?? 100;
    if (scoreRaw < min || scoreRaw > max) {
      return NextResponse.json(
        { error: `scoreRaw (${scoreRaw}) is outside the valid range [${min}, ${max}]` },
        { status: 400 },
      );
    }
  }

  const updated = await db.sCORMSession.update({
    where: { id },
    data: {
      ...rest,
      scoreRaw,
      scoreMin,
      scoreMax,
      cmiData: cmiData !== undefined ? JSON.stringify(cmiData) : undefined,
      // Completion is a one-way ratchet — once the learner has passed or completed
      // the content, a subsequent LMSFinish / Terminate call cannot downgrade it.
      // Without this guard a second call with "incomplete" would erase a passing grade.
      completionStatus:
        scormSession.completionStatus === "completed" || scormSession.completionStatus === "passed"
          ? scormSession.completionStatus
          : (rest.completionStatus ?? scormSession.completionStatus),
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "SCORM_SESSION_UPDATED",
    entityType: "SCORMSession",
    entityId: id,
    metadata: {
      packageId: scormSession.packageId,
      completionStatus: updated.completionStatus,
      scoreRaw: updated.scoreRaw,
      totalTime: rest.totalTime,
      severity: "LOW",
    },
  }).catch(() => {});

  // If lesson linked, mark lesson progress as complete when passed/completed
  if (
    (updated.completionStatus === "completed" || updated.completionStatus === "passed") &&
    scormSession.completionStatus !== "completed" &&
    scormSession.completionStatus !== "passed"
  ) {
    const pkg = await db.sCORMPackage.findUnique({
      where: { id: scormSession.packageId },
      select: { lessonId: true },
    });
    if (pkg?.lessonId) {
      const lesson = await db.courseLesson.findUnique({
        where: { id: pkg.lessonId },
        select: { moduleId: true },
      });
      if (lesson) {
        const module = await db.courseModule.findUnique({
          where: { id: lesson.moduleId },
          select: { courseId: true },
        });
        if (module) {
          const enrolment = await db.enrolment.findUnique({
            where: { userId_courseId: { userId: session.user.id, courseId: module.courseId } },
          });
          if (enrolment) {
            await db.lessonProgress.upsert({
              where: { enrolmentId_lessonId: { enrolmentId: enrolment.id, lessonId: pkg.lessonId } },
              create: { enrolmentId: enrolment.id, lessonId: pkg.lessonId, completed: true },
              update: { completed: true },
            });
          }
        }
      }
    }
  }

  return NextResponse.json({
    ...updated,
    cmiData: updated.cmiData ? JSON.parse(updated.cmiData) : {},
  });
}
