import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { generateCertificateNumber, generateOpenBadgeJwt, generateQrCode } from "@/lib/certificates";
import { addMonths } from "date-fns";
import { z } from "zod";
import { USER_ROLES } from "@/lib/constants";

const schema = z.object({
  attemptId: z.string(),
  decision: z.enum(["approved", "rejected", "referred"]),
  justification: z.string().min(10),
});

// POST /api/certificates/generate — Certification Officer approves and issues certificate
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ISO 17024 Cl.7.4 — only Certification Officers can make this decision
  if (!([USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.SUPER_ADMIN] as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — Certification Officer role required" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { attemptId, decision, justification } = body.data;

  // ── Fetch attempt data (outside transaction — read-only pre-checks) ─────────
  const attempt = await db.examAttempt.findFirst({
    where: { id: attemptId, status: "COMPLETED" },
    include: {
      user: {
        include: {
          profile: {
            select: {
              employer: true,
              sponsoringOrg: { select: { name: true } },
            },
          },
        },
      },
      examPaper: {
        include: { scheme: true },
      },
      certificationDecision: true,
    },
  });
  if (!attempt) return NextResponse.json({ error: "Attempt not found or not completed" }, { status: 404 });

  // ── ISO 17024 Cl.7.4 — duty separation: actual DB check ───────────────────
  // A Certification Officer must not have been the Trainer or Examiner for this
  // candidate. Only SUPER_ADMIN bypasses this rule (fully audit-logged).
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) {
    // Check 1: officer created (and thus trained) any course this candidate is enrolled in
    const trainerConflict = await db.course.findFirst({
      where: {
        creatorId: session.user.id,
        enrolments: { some: { userId: attempt.userId } },
      },
    });
    if (trainerConflict) {
      return NextResponse.json(
        { error: "Forbidden — ISO 17024 separation of duties: you have a trainer relationship with this candidate." },
        { status: 403 },
      );
    }

    // Check 2: officer graded this attempt (acted as examiner)
    const examinerConflict = await db.examGrade.findFirst({
      where: { attemptId, examinerId: session.user.id },
    });
    if (examinerConflict) {
      return NextResponse.json(
        { error: "Forbidden — ISO 17024 separation of duties: you acted as an examiner (graded questions) in this attempt and cannot issue the certificate." },
        { status: 403 },
      );
    }

    // Check 3: officer has a declared, active conflict of interest with this candidate.
    // ISO 17024 Cl.4.3 — impartiality obligations require that a declared COI
    // blocks certification decisions regardless of role separation.
    // Only non-expired declarations where hasConflict is true are blocking.
    const coiConflict = await db.cOIDeclaration.findFirst({
      where: {
        userId: session.user.id,
        hasConflict: true,
        expiresAt: { gt: new Date() }, // only active declarations
        // conflictDetails may reference the candidateId — we block on any active
        // COI rather than trying to parse free-text details, so the officer must
        // re-declare a "no conflict" to proceed.
      },
    });
    if (coiConflict) {
      return NextResponse.json(
        {
          error:
            "Forbidden — ISO 17024 Cl.4.3: you have an active conflict-of-interest declaration. " +
            "A colleague without a declared conflict must process this certification decision.",
        },
        { status: 403 },
      );
    }
  }

  // ── Atomic decision creation (CRITICAL-2: TOCTOU fix) ──────────────────────
  // Rely on the unique constraint on CertificationDecision.attemptId rather than
  // a read-then-write interactive transaction, which is incompatible with
  // PgBouncer in transaction-pooling mode (Supabase production).
  // A P2002 (unique constraint violation) is the same outcome as the inner
  // findUnique returning a duplicate — same 409 response to the caller.
  let certDecision: Awaited<ReturnType<typeof db.certificationDecision.create>>;
  try {
    certDecision = await db.certificationDecision.create({
      data: {
        attemptId,
        certificationOfficerId: session.user.id,
        decision,
        justification,
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation on attemptId — decision already exists
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Decision already made for this attempt" }, { status: 409 });
    }
    throw err;
  }

  await auditLog({
    userId: session.user.id,
    action: "CERTIFICATION_DECISION",
    entityType: "CertificationDecision",
    entityId: certDecision.id,
    metadata: { decision, attemptId, candidateId: attempt.userId, justification },
  });

  // C3: Guard — an "approved" decision must only be issued when the candidate
  // actually passed. Prevents a CO from manually approving a failed attempt
  // by calling the API directly with decision:"approved".
  if (decision === "approved" && attempt.passed !== true) {
    return NextResponse.json(
      {
        error:
          `Cannot approve: the candidate's attempt has not been marked as passed ` +
          `(passed=${attempt.passed ?? "null"}). Grade the attempt first.`,
      },
      { status: 422 },
    );
  }

  if (decision !== "approved") {
    await db.notification.create({
      data: {
        userId: attempt.userId,
        type: "SYSTEM_ALERT",
        title: `Certification ${decision === "rejected" ? "Not Awarded" : "Referred for Review"}`,
        message:
          decision === "rejected"
            ? "Your certification application was not successful. You may appeal this decision."
            : "Your application has been referred for further review. You will be contacted shortly.",
        link: "/appeals/new",
      },
    });
    return NextResponse.json({ decision, certDecisionId: certDecision.id });
  }

  // ── Issue certificate ──────────────────────────────────────────────────────
  const scheme = attempt.examPaper.scheme;
  if (!scheme) return NextResponse.json({ error: "No scheme linked to this exam" }, { status: 400 });

  // M: cert date edge case — validityMonths must be positive so expiresAt > issuedAt.
  if (scheme.validityMonths <= 0) {
    return NextResponse.json(
      { error: "Scheme has an invalid validity period (must be at least 1 month). Update the scheme before issuing certificates." },
      { status: 422 },
    );
  }

  const certNumber = await generateCertificateNumber();
  const issuedAt = new Date();
  const expiresAt = addMonths(issuedAt, scheme.validityMonths);

  const { json: openBadgeJson, jwt: openBadgeJwt } = await generateOpenBadgeJwt({
    certificateId: certDecision.id,
    certificateNumber: certNumber,
    candidateId: attempt.userId,
    candidateName: `${attempt.user.firstName} ${attempt.user.lastName}`,
    candidateEmail: attempt.user.email,
    schemeName: scheme.name,
    schemeCode: scheme.code,
    issuedAt,
    expiresAt,
  });

  const qrCodeUrl = await generateQrCode(certNumber);

  // Certificate create + audit log written sequentially with a compensating
  // delete if the follow-up writes fail. The interactive $transaction callback
  // form is incompatible with PgBouncer transaction-pooling mode (Supabase).
  // The compensating delete preserves the invariant: a certificate row must
  // always have a corresponding audit trail entry (ISO 17024 Cl.9.5).
  const certificate = await db.certificate.create({
    data: {
      userId: attempt.userId,
      schemeId: scheme.id,
      decisionId: certDecision.id,
      certificateNumber: certNumber,
      status: "ACTIVE",
      issuedAt,
      expiresAt,
      openBadgeJson: JSON.stringify(openBadgeJson),
      openBadgeJwt,
      qrCodeUrl,
      // Cl.7.1 ISO 17024 — immutable snapshots of the scheme at issuance.
      // If the scheme is renamed or the standard version updated, the cert
      // record still reflects exactly what the candidate was certified against.
      schemeNameSnapshot: scheme.name,
      schemeCodeSnapshot: scheme.code,
      standardVersion: scheme.standardVersion ?? "ISO/IEC 17024:2012",
      examPaperTitleSnapshot: attempt.examPaper.title,
      candidateEmployerSnapshot: attempt.user.profile?.employer ?? null,
      sponsoringOrgNameSnapshot: attempt.user.profile?.sponsoringOrg?.name ?? null,
    },
  });

  try {
    if (scheme.cpdHoursRequired > 0) {
      await db.cPDRecord.create({
        data: {
          userId: attempt.userId,
          schemeId: scheme.id,
          title: `${scheme.name} — Certification Examination`,
          type: "course_completion",
          hoursLogged: scheme.cpdHoursRequired,
          activityDate: issuedAt,
          status: "approved",
          reviewNote: "Auto-credited on certification",
        },
      });
    }

    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CERTIFICATE_ISSUED",
        entityType: "Certificate",
        entityId: certificate.id,
        metadata: JSON.stringify({ certNumber, schemeCode: scheme.code, candidateId: attempt.userId, expiresAt }),
      },
    });
  } catch (err) {
    // Compensate: delete the certificate row so the issuance is not untracked.
    await db.certificate.delete({ where: { id: certificate.id } }).catch(() => {});
    throw err;
  }

  // Notification is best-effort — failure must not roll back the certificate.
  await db.notification.create({
    data: {
      userId: attempt.userId,
      type: "CERTIFICATE_EXPIRY",
      title: `Certificate Issued — ${scheme.name}`,
      message: `Congratulations! Your ${scheme.name} certificate (${certNumber}) has been issued. Valid until ${expiresAt.toLocaleDateString()}.`,
      link: `/certificates/${certificate.id}`,
    },
  }).catch(() => {});

  return NextResponse.json({ certificate }, { status: 201 });
}
