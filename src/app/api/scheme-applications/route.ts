import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";
import { USER_ROLES } from "@/lib/constants";

const OFFICER_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

const submitSchema = z.object({
  courseId: z.string(),
  declaredExperience: z.number().int().nonnegative().optional(),
  declaredQualification: z.string().max(200).optional(),
  priorCertNumbers: z.array(z.string().max(100)).max(10).optional(),
  idDocumentUrl: z.string().url().optional(),
  qualificationDocUrl: z.string().url().optional(),
  employerLetterUrl: z.string().url().optional(),
});

// POST /api/scheme-applications — candidate submits an application
// Creates SchemeApplication, notifies COs, schedules auto-approval.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = submitSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const {
    courseId,
    declaredExperience,
    declaredQualification,
    priorCertNumbers,
    idDocumentUrl,
    qualificationDocUrl,
    employerLetterUrl,
  } = body.data;

  const course = await db.course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
    select: {
      id: true,
      scheme: {
        select: { id: true, name: true, code: true, autoApproveMinutes: true },
      },
    },
  });

  if (!course?.scheme) {
    return NextResponse.json({ error: "Course or scheme not found" }, { status: 404 });
  }

  const scheme = course.scheme;

  // Guard: prevent duplicate pending applications
  const alreadyPending = await db.schemeApplication.findFirst({
    where: {
      userId: session.user.id,
      schemeId: scheme.id,
      status: { in: ["PENDING", "APPROVED", "AUTO_APPROVED"] },
    },
    select: { id: true, status: true },
  });
  if (alreadyPending) {
    return NextResponse.json(
      { error: alreadyPending.status === "PENDING" ? "You already have a pending application for this scheme." : "Your application has already been approved." },
      { status: 409 },
    );
  }

  // Capture IP server-side — must not rely on client-sent value
  const ip =
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const application = await db.schemeApplication.create({
    data: {
      userId: session.user.id,
      schemeId: scheme.id,
      courseId: course.id,
      status: "PENDING",
      declaredAge: true,
      declaredExperience: declaredExperience ?? null,
      declaredQualification: declaredQualification ?? null,
      priorCertNumbers: priorCertNumbers?.length ? JSON.stringify(priorCertNumbers) : null,
      idDocumentUrl: idDocumentUrl ?? null,
      qualificationDocUrl: qualificationDocUrl ?? null,
      employerLetterUrl: employerLetterUrl ?? null,
      legalDeclarationAt: new Date(),
      legalDeclarationIp: ip,
    },
  });

  const applicationRef = `APP-${scheme.code}-${application.id.slice(-6).toUpperCase()}`;

  const [candidate, officers] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { firstName: true, lastName: true },
    }),
    db.user.findMany({
      where: { role: { in: OFFICER_ROLES as string[] }, status: "ACTIVE" },
      select: { id: true },
    }),
  ]);

  if (officers.length > 0 && candidate) {
    await db.notification.createMany({
      data: officers.map((o) => ({
        userId: o.id,
        type: "RENEWAL_REMINDER",
        title: `New Application — ${scheme.name}`,
        message:
          `${candidate.firstName} ${candidate.lastName} submitted an application for ` +
          `${scheme.name}. Ref: ${applicationRef}`,
        link: `/manage/applications`,
      })),
      skipDuplicates: true,
    });
  }

  // Schedule auto-approval after the configured window
  await inngest.send({
    name: EVENTS.APPLICATION_AUTO_APPROVE,
    data: { applicationId: application.id, autoApproveMinutes: scheme.autoApproveMinutes },
    // ts schedules the event delivery (Inngest will not fire until this time)
    ts: Date.now() + scheme.autoApproveMinutes * 60_000,
  });

  await auditLog({
    userId: session.user.id,
    action: "SCHEME_APPLICATION_SUBMITTED",
    entityType: "SchemeApplication",
    entityId: application.id,
    metadata: { applicationRef, schemeId: scheme.id, courseId: course.id },
  });

  return NextResponse.json(
    { applicationRef, status: "PENDING", applicationId: application.id },
    { status: 201 },
  );
}

// GET /api/scheme-applications — CO/SUPER_ADMIN fetches applications
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(OFFICER_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "PENDING";

  const applications = await db.schemeApplication.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      scheme: { select: { id: true, name: true, code: true } },
      course: { select: { id: true, title: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ applications });
}
