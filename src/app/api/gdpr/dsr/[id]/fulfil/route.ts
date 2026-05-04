import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

// ── POST /api/gdpr/dsr/[id]/fulfil — fulfil a data subject request ───────────
//
// Handles two request types automatically:
//   access / portability — builds a full JSON export of the subject's data
//   erasure              — anonymises PII while preserving required records
//
// Other types (rectification, restriction) require manual admin resolution;
// this endpoint marks them resolved with a note.
//
// Art. 17(3) GDPR — erasure must not destroy records where retention is required
// by law. This implementation retains:
//   - Certificate records (7 years, ISO 17024 Cl.9 + Art. 17(3)(b))
//   - ExamAttempt records (3 years, assessment integrity)
//   - AuditLog records (6 years, legal/regulatory)
// All other PII fields are anonymised (nulled / replaced with placeholder text).

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const schema = z.object({
    resolutionNotes: z.string().max(2000).optional(),
  });
  const body = schema.safeParse(await req.json().catch(() => ({})));
  const resolutionNotes = body.success ? (body.data.resolutionNotes ?? null) : null;

  const dsr = await db.dataSubjectRequest.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!dsr) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (dsr.status === "resolved" || dsr.status === "rejected") {
    return NextResponse.json({ error: "Request is already closed" }, { status: 409 });
  }

  // ── Access / Portability export ───────────────────────────────────────────
  if (dsr.type === "access" || dsr.type === "portability") {
    const [profile, enrolments, attempts, certificates, cpdRecords, consentRecords, payments] =
      await Promise.all([
        db.candidateProfile.findUnique({ where: { userId: dsr.userId } }),
        db.enrolment.findMany({
          where: { userId: dsr.userId },
          include: { course: { select: { title: true, slug: true } } },
        }),
        db.examAttempt.findMany({
          where: { userId: dsr.userId },
          select: {
            id: true, status: true, startedAt: true, submittedAt: true,
            rawScore: true, percentageScore: true, passed: true, durationMins: true,
            examPaper: { select: { title: true } },
          },
        }),
        db.certificate.findMany({
          where: { userId: dsr.userId },
          select: {
            certificateNumber: true, status: true, issuedAt: true,
            expiresAt: true, revokedAt: true, revocationReason: true,
            scheme: { select: { name: true, code: true } },
          },
        }),
        db.cPDRecord.findMany({ where: { userId: dsr.userId } }),
        db.consentRecord.findMany({ where: { userId: dsr.userId } }),
        db.purchase.findMany({
          where: { userId: dsr.userId },
          select: { id: true, amount: true, currency: true, status: true, createdAt: true },
        }),
      ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      requestId: dsr.id,
      subject: {
        id: dsr.user.id,
        email: dsr.user.email,
        firstName: dsr.user.firstName,
        lastName: dsr.user.lastName,
        phone: dsr.user.phone,
        createdAt: dsr.user.createdAt,
        lastLoginAt: dsr.user.lastLoginAt,
        role: dsr.user.role,
        status: dsr.user.status,
        mfaEnabled: dsr.user.mfaEnabled,
      },
      profile,
      enrolments,
      examAttempts: attempts,
      certificates,
      cpdRecords,
      consentRecords,
      payments,
    };

    // Mark the DSR resolved and store the export inline (exportUrl would point to
    // a signed S3 URL in production — kept as JSON string here for simplicity)
    await db.dataSubjectRequest.update({
      where: { id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        exportUrl: "inline", // replace with signed S3 URL upload in production
        notes: resolutionNotes,
      },
    });

    await auditLog({
      userId: session.user.id,
      action: "DSR_FULFILLED_ACCESS",
      entityType: "DataSubjectRequest",
      entityId: id,
      metadata: { subjectId: dsr.userId, type: dsr.type },
    });

    return NextResponse.json({ exportData });
  }

  // ── Erasure ────────────────────────────────────────────────────────────────
  if (dsr.type === "erasure") {
    // Check for legal hold (e.g. ongoing litigation, regulatory investigation)
    if (dsr.legalHold) {
      return NextResponse.json(
        { error: `Erasure blocked by legal hold: ${dsr.legalHoldReason ?? "no reason specified"}` },
        { status: 409 },
      );
    }

    // CRITICAL: anonymise PII while preserving legally required records.
    // Art. 17(3)(b) — processing necessary for compliance with a legal obligation.
    // Certificates and exam records must survive for regulatory traceability.
    //
    // Array form is PgBouncer transaction-pooling compatible (Supabase).
    // anonEmail is computed before the transaction since the array form does
    // not support referencing results from earlier operations in the same batch.
    const anonEmail = `deleted-${dsr.userId}@anonymised.invalid`;
    await db.$transaction([
      // 1. Anonymise the User row — replace PII with placeholder tokens.
      //    The user row is kept (cannot hard-delete) because Certificate,
      //    ExamAttempt, and AuditLog rows reference it via foreign keys.
      db.user.update({
        where: { id: dsr.userId },
        data: {
          email: anonEmail,
          firstName: "[Deleted]",
          lastName: "[Deleted]",
          phone: null,
          photoUrl: null,
          passwordHash: null,
          mfaSecret: null,
          status: "INACTIVE",
          emailVerified: null,
          lastLoginAt: null,
          // Retain: id, role, createdAt (needed for audit / cert foreign key)
        },
      }),
      // 2. Anonymise CandidateProfile (optional extended PII)
      db.candidateProfile.updateMany({
        where: { userId: dsr.userId },
        data: {
          professionalTitle: null,
          employer: null,
          linkedinUrl: null,
          // country retained — not directly identifying alone
        },
      }),
      // 3. Delete consent records (no longer needed once erased)
      db.consentRecord.deleteMany({ where: { userId: dsr.userId } }),
      // 4. Delete notifications (personal comms content)
      db.notification.deleteMany({ where: { userId: dsr.userId } }),
      // 5. Invalidate all auth sessions
      db.session.deleteMany({ where: { userId: dsr.userId } }),
      db.account.deleteMany({ where: { userId: dsr.userId } }),
      // Certificates, ExamAttempts, AuditLogs, CPDRecords, EnrolmentRecords
      // are intentionally NOT deleted — they are subject to statutory retention.
      // Certificate records: 7 years (ISO 17024 Cl.9)
      // Exam records:        3 years (assessment integrity)
      // Audit logs:          6 years (legal/regulatory)
      // CPD records:         5 years (recertification evidence)

      // 6. Mark the DSR as resolved with an audit trail entry in the same batch
      db.dataSubjectRequest.update({
        where: { id },
        data: {
          status: "resolved",
          resolvedAt: new Date(),
          notes: resolutionNotes,
        },
      }),
      db.auditLog.create({
        data: {
          userId: session.user.id,
          action: "DSR_FULFILLED_ERASURE",
          entityType: "DataSubjectRequest",
          entityId: id,
          metadata: JSON.stringify({
            subjectId: dsr.userId,
            anonEmail,
            retainedEntities: ["Certificate", "ExamAttempt", "AuditLog", "CPDRecord", "Enrolment"],
            reason: "Art. 17(3)(b) GDPR — statutory retention obligation",
          }),
        },
      }),
    ]);

    return NextResponse.json({ ok: true, anonymised: true });
  }

  // ── Manual types: rectification, restriction ──────────────────────────────
  await db.dataSubjectRequest.update({
    where: { id },
    data: { status: "resolved", resolvedAt: new Date(), notes: resolutionNotes },
  });

  await auditLog({
    userId: session.user.id,
    action: "DSR_RESOLVED",
    entityType: "DataSubjectRequest",
    entityId: id,
    metadata: { type: dsr.type, subjectId: dsr.userId },
  });

  return NextResponse.json({ ok: true });
}
