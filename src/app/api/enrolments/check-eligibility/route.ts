import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ courseId: z.string() });

// POST /api/enrolments/check-eligibility
// Validates whether the authenticated candidate meets the hard eligibility
// requirements for a course's scheme, and returns soft requirements that
// need a formal SchemeApplication (ISO 17024 Cl.6.1).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { courseId } = body.data;

  const course = await db.course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
    select: {
      id: true,
      scheme: {
        select: {
          id: true,
          name: true,
          eligibilityEnabled: true,
          minAgeYears: true,
          minExperienceYears: true,
          requiredQualifications: true,
          requiredPriorCerts: true,
          requiresDocuments: true,
          requiresEmployerLetter: true,
          requiresIdDocument: true,
          eligibilityNotes: true,
          autoApproveMinutes: true,
        },
      },
    },
  });

  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  // No scheme or eligibility disabled — immediate pass
  if (!course.scheme?.eligibilityEnabled) {
    return NextResponse.json({ eligible: true, requiresApplication: false });
  }

  const scheme = course.scheme;

  // ── Hard check: age ────────────────────────────────────────────────────────
  if (scheme.minAgeYears) {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { dateOfBirth: true },
    });

    if (!profile?.dateOfBirth) {
      return NextResponse.json({
        eligible: false,
        reason: "AGE_UNVERIFIABLE",
        action: "Complete your profile with your date of birth to verify age eligibility.",
      });
    }

    const ageYears = Math.floor(
      (Date.now() - profile.dateOfBirth.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
    );
    if (ageYears < scheme.minAgeYears) {
      return NextResponse.json({
        eligible: false,
        reason: "AGE_TOO_YOUNG",
        action: `You must be at least ${scheme.minAgeYears} years old to apply for this certification.`,
      });
    }
  }

  // ── Hard check: prior certifications ──────────────────────────────────────
  if (scheme.requiredPriorCerts) {
    const requiredCodes: string[] = JSON.parse(scheme.requiredPriorCerts);
    if (requiredCodes.length > 0) {
      const heldCerts = await db.certificate.findMany({
        where: {
          userId: session.user.id,
          status: "ACTIVE",
          deletedAt: null,
          scheme: { code: { in: requiredCodes } },
        },
        select: { scheme: { select: { code: true } } },
      });

      const heldCodes = new Set(heldCerts.map((c) => c.scheme.code));
      const missing = requiredCodes.filter((code) => !heldCodes.has(code));

      if (missing.length > 0) {
        const missingSchemes = await db.certificationScheme.findMany({
          where: { code: { in: missing } },
          select: { name: true },
        });
        const names = missingSchemes.map((s) => s.name).join(", ") || missing.join(", ");
        return NextResponse.json({
          eligible: false,
          reason: "MISSING_PRIOR_CERT",
          action: `You must hold the following certification(s) before applying: ${names}.`,
        });
      }
    }
  }

  // ── All hard checks passed ─────────────────────────────────────────────────
  const requiresApplication =
    !!scheme.minExperienceYears ||
    !!scheme.requiredQualifications ||
    scheme.requiresDocuments ||
    scheme.requiresEmployerLetter ||
    scheme.requiresIdDocument;

  if (!requiresApplication) {
    return NextResponse.json({ eligible: true, requiresApplication: false });
  }

  // Check for an existing non-rejected application (candidate already applied)
  const existingActive = await db.schemeApplication.findFirst({
    where: {
      userId: session.user.id,
      schemeId: scheme.id,
      status: { in: ["PENDING", "APPROVED", "AUTO_APPROVED"] },
    },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });

  if (existingActive) {
    // APPROVED/AUTO_APPROVED: pass through so enrolment can be created
    // PENDING: block with informative message (not eligible to double-apply)
    if (existingActive.status === "PENDING") {
      return NextResponse.json({
        eligible: true,
        requiresApplication: false,
        applicationPending: true,
      });
    }
    return NextResponse.json({ eligible: true, requiresApplication: false });
  }

  // Check for a previous rejection (pre-fill reapplication form)
  const previousRejection = await db.schemeApplication.findFirst({
    where: { userId: session.user.id, schemeId: scheme.id, status: "REJECTED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rejectionReason: true,
      reviewedAt: true,
      declaredExperience: true,
      declaredQualification: true,
      priorCertNumbers: true,
    },
  });

  return NextResponse.json({
    eligible: true,
    requiresApplication: true,
    schemeId: scheme.id,
    schemeName: scheme.name,
    requirements: {
      minExperienceYears: scheme.minExperienceYears,
      requiredQualifications: scheme.requiredQualifications
        ? (JSON.parse(scheme.requiredQualifications) as string[])
        : null,
      requiresDocuments: scheme.requiresDocuments,
      requiresEmployerLetter: scheme.requiresEmployerLetter,
      requiresIdDocument: scheme.requiresIdDocument,
      eligibilityNotes: scheme.eligibilityNotes,
      autoApproveMinutes: scheme.autoApproveMinutes,
    },
    previousRejection: previousRejection
      ? {
          id: previousRejection.id,
          rejectionReason: previousRejection.rejectionReason,
          reviewedAt: previousRejection.reviewedAt?.toISOString() ?? null,
          declaredExperience: previousRejection.declaredExperience,
          declaredQualification: previousRejection.declaredQualification,
          priorCertNumbers: previousRejection.priorCertNumbers,
        }
      : null,
  });
}
