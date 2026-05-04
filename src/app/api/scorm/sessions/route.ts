import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

// Staff roles that may access SCORM content without a formal enrolment
// (content review, QA, previewing packages before publishing).
const STAFF_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.CERTIFICATION_OFFICER,
  USER_ROLES.TRAINER,
];

/** GET or create a SCORM session for the current user + package */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId } = await req.json();
  if (!packageId) return NextResponse.json({ error: "packageId required" }, { status: 400 });

  // Fetch the package and its lesson→module→course chain in a single query.
  // We need the courseId to verify enrolment before creating a session.
  const pkg = await db.sCORMPackage.findUnique({
    where: { id: packageId },
    include: {
      lesson: {
        select: {
          module: { select: { courseId: true } },
        },
      },
    },
  });
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });

  // ── Enrolment gate ────────────────────────────────────────────────────────
  // A learner must be enrolled in the course that contains this SCORM package.
  // Without this check any authenticated user could open any SCORM package,
  // bypassing the payment / registration flow entirely.
  //
  // Staff (TRAINER, CERTIFICATION_OFFICER, SUPER_ADMIN) are exempt so they can
  // preview and QA packages before they are published to learners.
  //
  // Packages that are not yet linked to a lesson (pkg.lesson === null) are
  // accessible only to staff — they have not been published to a course yet.
  const isStaff = (STAFF_ROLES as string[]).includes(session.user.role);
  const courseId = pkg.lesson?.module?.courseId ?? null;

  if (!isStaff) {
    if (!courseId) {
      // Package exists but is not linked to any course — not accessible to learners yet.
      return NextResponse.json({ error: "This content is not yet available" }, { status: 403 });
    }

    const enrolment = await db.enrolment.findUnique({
      where: { userId_courseId: { userId: session.user.id, courseId } },
    });
    if (!enrolment) {
      return NextResponse.json({ error: "You are not enrolled in this course" }, { status: 403 });
    }
  }

  // Upsert — resume if exists, create fresh if not
  const existing = await db.sCORMSession.findUnique({
    where: { userId_packageId: { userId: session.user.id, packageId } },
  });

  if (existing) {
    // Return existing session — content will resume from where it left off
    return NextResponse.json({
      ...existing,
      entry: existing.completionStatus === "not attempted" ? "ab-initio" : "resume",
      cmiData: existing.cmiData ? JSON.parse(existing.cmiData) : {},
    });
  }

  const newSession = await db.sCORMSession.create({
    data: {
      userId: session.user.id,
      packageId,
      completionStatus: "not attempted",
      entry: "ab-initio",
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "SCORM_SESSION_STARTED",
    entityType: "SCORMSession",
    entityId: newSession.id,
    metadata: { packageId, completionStatus: "not attempted", severity: "LOW" },
  }).catch(() => {});

  return NextResponse.json({
    ...newSession,
    cmiData: {},
  }, { status: 201 });
}
