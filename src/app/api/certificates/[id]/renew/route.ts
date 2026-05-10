import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { generateCertificateNumber, generateOpenBadgeJwt, generateQrCode } from "@/lib/certificates";
import { USER_ROLES, RENEWAL_WARNINGS_DAYS } from "@/lib/constants";
import { addMonths, addDays, subMonths } from "date-fns";

const OFFICER_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

// Candidates may request renewal starting from the earliest warning window.
const RENEWAL_WINDOW_DAYS = Math.max(...RENEWAL_WARNINGS_DAYS); // 180 days

// ── GET /api/certificates/[id]/renew — eligibility check ─────────────────────
// Returns the certificate, CPD progress, and whether renewal can be issued now.
// Candidates may only query their own certificates; CO/admin may query any.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const isOfficer = (OFFICER_ROLES as string[]).includes(session.user.role);

  const cert = await db.certificate.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(!isOfficer ? { userId: session.user.id } : {}),
    },
    include: {
      scheme: { select: { id: true, name: true, code: true, validityMonths: true, cpdHoursRequired: true, passMark: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      renewals: { orderBy: { renewedAt: "desc" }, take: 1 },
    },
  });

  if (!cert) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });

  // CPD hours logged since last issuance (or last renewal)
  const cpdSince = cert.renewals[0]?.renewedAt ?? cert.issuedAt;
  const cpdLogged = await db.cPDRecord.aggregate({
    where: {
      userId: cert.userId,
      schemeId: cert.schemeId,
      status: "approved",
      activityDate: { gte: cpdSince },
    },
    _sum: { hoursLogged: true },
  });
  const cpdHoursLogged = cpdLogged._sum.hoursLogged ?? 0;
  const cpdRequired = cert.scheme.cpdHoursRequired;
  const cpdMet = cpdHoursLogged >= cpdRequired;

  // ISO 17024 Cl.6.8 — check if scheme requires a recent passed examination for renewal.
  // Convention: passMark > 0 signals the scheme is examination-based.
  // Candidates must have passed an exam within the last (validityMonths/2) months.
  const examRequired = cert.scheme.passMark > 0 && cert.scheme.validityMonths > 0;
  let examMet = true;
  const examWindowMonths = examRequired ? Math.ceil(cert.scheme.validityMonths / 2) : null;
  if (examRequired && examWindowMonths) {
    const examWindowStart = subMonths(new Date(), examWindowMonths);
    const recentPassed = await db.examAttempt.count({
      where: {
        userId: cert.userId,
        status: "COMPLETED",
        passed: true,
        createdAt: { gte: examWindowStart },
        examPaper: { schemeId: cert.schemeId },
      },
    });
    examMet = recentPassed > 0;
  }

  // Renewal window: ACTIVE certs within 180 days of expiry, or EXPIRED certs
  const now = new Date();
  const windowOpensAt = cert.expiresAt ? addDays(cert.expiresAt, -RENEWAL_WINDOW_DAYS) : null;
  const inRenewalWindow = cert.expiresAt
    ? now >= windowOpensAt! || cert.status === "EXPIRED"
    : cert.status === "EXPIRED";

  const canIssue = inRenewalWindow && cpdMet && examMet && !["REVOKED", "SUSPENDED"].includes(cert.status);
  // ISO 17024 Cl.6.8 — candidates must meet CPD hours and exam requirement before requesting renewal.
  const canRequest = inRenewalWindow
    && !["REVOKED", "SUSPENDED"].includes(cert.status)
    && (cpdRequired === 0 || cpdMet)
    && examMet;

  return NextResponse.json({
    certificate: {
      id: cert.id,
      certificateNumber: cert.certificateNumber,
      status: cert.status,
      issuedAt: cert.issuedAt.toISOString(),
      expiresAt: cert.expiresAt?.toISOString() ?? null,
      holder: cert.user,
      scheme: cert.scheme,
    },
    cpd: {
      required: cpdRequired,
      logged: cpdHoursLogged,
      met: cpdMet,
      measuredSince: cpdSince.toISOString(),
    },
    exam: {
      required: examRequired,
      met: examMet,
      windowMonths: examWindowMonths,
    },
    renewal: {
      windowOpensAt: windowOpensAt?.toISOString() ?? null,
      inRenewalWindow,
      canRequest,
      canIssue,
      lastRenewal: cert.renewals[0]?.renewedAt.toISOString() ?? null,
    },
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), notes: z.string().max(1000).optional() }),
  z.object({ action: z.literal("issue"), notes: z.string().max(1000).optional() }),
]);

// ── POST /api/certificates/[id]/renew — request or issue renewal ──────────────
//
// action="request" — Candidate asks the Certification Officer to review their
//   renewal. Creates in-app notifications for all active CO/SUPER_ADMIN and
//   writes an audit record. Does NOT issue a new certificate.
//
// action="issue" — Certification Officer issues the renewal. Creates a new
//   Certificate record (new number, new expiry), a CertificateRenewal record
//   linking old → new, sets the old certificate to LAPSED, notifies the holder,
//   and writes to the audit log. CO/SUPER_ADMIN only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const isOfficer = (OFFICER_ROLES as string[]).includes(session.user.role);

  if (body.data.action === "issue" && !isOfficer) {
    return NextResponse.json({ error: "Forbidden — Certification Officer role required to issue renewals" }, { status: 403 });
  }

  const cert = await db.certificate.findFirst({
    where: {
      id,
      deletedAt: null,
      // Candidates may only act on their own certificates
      ...(!isOfficer ? { userId: session.user.id } : {}),
    },
    include: {
      scheme: { select: { id: true, name: true, code: true, validityMonths: true, cpdHoursRequired: true, passMark: true, standardVersion: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      renewals: { orderBy: { renewedAt: "desc" }, take: 1 },
    },
  });

  if (!cert) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });

  if (["REVOKED", "SUSPENDED"].includes(cert.status)) {
    return NextResponse.json(
      { error: `A ${cert.status.toLowerCase()} certificate cannot be renewed. Contact your Certification Officer.` },
      { status: 422 },
    );
  }

  // ── action: request ───────────────────────────────────────────────────────────
  if (body.data.action === "request") {
    const now = new Date();
    const windowOpensAt = cert.expiresAt ? addDays(cert.expiresAt, -RENEWAL_WINDOW_DAYS) : now;
    if (cert.expiresAt && now < windowOpensAt) {
      return NextResponse.json(
        { error: `Renewal requests open ${RENEWAL_WINDOW_DAYS} days before expiry. Window opens on ${windowOpensAt.toLocaleDateString()}.` },
        { status: 422 },
      );
    }

    // Enforce CPD requirement (ISO 17024 Cl.6.8) — server-side guard mirrors GET canRequest logic.
    if (cert.scheme.cpdHoursRequired > 0) {
      const cpdSince = cert.renewals[0]?.renewedAt ?? cert.issuedAt;
      const cpdResult = await db.cPDRecord.aggregate({
        where: {
          userId: cert.userId,
          schemeId: cert.schemeId,
          status: "approved",
          activityDate: { gte: cpdSince },
        },
        _sum: { hoursLogged: true },
      });
      const cpdLogged = cpdResult._sum.hoursLogged ?? 0;
      if (cpdLogged < cert.scheme.cpdHoursRequired) {
        return NextResponse.json(
          {
            error: `CPD requirement not met. Required: ${cert.scheme.cpdHoursRequired}h, logged: ${cpdLogged}h.`,
            shortfall: cert.scheme.cpdHoursRequired - cpdLogged,
          },
          { status: 422 },
        );
      }
    }

    // ISO 17024 Cl.6.8 — examination re-sit requirement for renewal
    if (cert.scheme.passMark > 0 && cert.scheme.validityMonths > 0) {
      const windowMonths = Math.ceil(cert.scheme.validityMonths / 2);
      const examWindowStart = subMonths(new Date(), windowMonths);
      const recentPassed = await db.examAttempt.count({
        where: {
          userId: cert.userId,
          status: "COMPLETED",
          passed: true,
          createdAt: { gte: examWindowStart },
          examPaper: { schemeId: cert.schemeId },
        },
      });
      if (recentPassed === 0) {
        return NextResponse.json(
          {
            error: `A new examination is required for renewal. You must pass an examination for ${cert.scheme.name} within the last ${windowMonths} months.`,
          },
          { status: 422 },
        );
      }
    }

    const officers = await db.user.findMany({
      where: {
        role: { in: [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER] },
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (officers.length > 0) {
      await db.notification.createMany({
        data: officers.map((o) => ({
          userId: o.id,
          type: "RENEWAL_REMINDER",
          title: `Renewal Requested — ${cert.certificateNumber}`,
          message:
            `${cert.user.firstName} ${cert.user.lastName} has requested renewal of their ` +
            `${cert.scheme.name} certificate (${cert.certificateNumber}).` +
            (body.data.notes ? ` Note: ${body.data.notes}` : ""),
          link: `/manage/certificates`,
        })),
        skipDuplicates: true,
      });
    }

    await auditLog({
      userId: session.user.id,
      action: "CERTIFICATE_RENEWAL_REQUESTED",
      entityType: "Certificate",
      entityId: cert.id,
      metadata: { certificateNumber: cert.certificateNumber, schemeCode: cert.scheme.code },
    });

    return NextResponse.json({ ok: true, action: "requested" });
  }

  // ── action: issue (CO only) ────────────────────────────────────────────────────
  const cpdSince = cert.renewals[0]?.renewedAt ?? cert.issuedAt;
  const cpdLogged = await db.cPDRecord.aggregate({
    where: {
      userId: cert.userId,
      schemeId: cert.schemeId,
      status: "approved",
      activityDate: { gte: cpdSince },
    },
    _sum: { hoursLogged: true },
  });
  const cpdHoursLogged = cpdLogged._sum.hoursLogged ?? 0;

  if (cert.scheme.cpdHoursRequired > 0 && cpdHoursLogged < cert.scheme.cpdHoursRequired) {
    return NextResponse.json(
      {
        error: `CPD requirement not met. Required: ${cert.scheme.cpdHoursRequired}h, logged: ${cpdHoursLogged}h.`,
        shortfall: cert.scheme.cpdHoursRequired - cpdHoursLogged,
      },
      { status: 422 },
    );
  }

  const issuedAt = new Date();
  const expiresAt = addMonths(issuedAt, cert.scheme.validityMonths);
  const newCertNumber = await generateCertificateNumber();

  const { json: openBadgeJson, jwt: openBadgeJwt } = await generateOpenBadgeJwt({
    certificateId: cert.id,
    certificateNumber: newCertNumber,
    candidateId: cert.userId,
    candidateName: `${cert.user.firstName} ${cert.user.lastName}`,
    candidateEmail: cert.user.email,
    schemeName: cert.scheme.name,
    schemeCode: cert.scheme.code,
    issuedAt,
    expiresAt,
  });

  const qrCodeUrl = await generateQrCode(newCertNumber);

  // Update the existing certificate in-place rather than creating a new record.
  // A new Certificate requires a CertificationDecision FK (which renewals don't have),
  // so we extend the original cert with new badge data and a fresh expiry date instead.
  // Array form is PgBouncer transaction-pooling compatible (Supabase).
  const [updatedCert] = await db.$transaction([
    db.certificate.update({
      where: { id: cert.id },
      data: {
        certificateNumber: newCertNumber,
        status: "ACTIVE",
        issuedAt,
        expiresAt,
        openBadgeJson: openBadgeJson,
        openBadgeJwt,
        qrCodeUrl,
        schemeNameSnapshot: cert.scheme.name,
        schemeCodeSnapshot: cert.scheme.code,
        standardVersion: cert.scheme.standardVersion ?? "ISO/IEC 17024:2012",
      },
    }),
    // Record the renewal event (captures CPD logged at renewal time)
    db.certificateRenewal.create({
      data: {
        certificateId: cert.id,
        newExpiresAt: expiresAt,
        cpdHoursLogged: cpdHoursLogged,
        notes: body.data.notes ?? null,
      },
    }),
    db.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CERTIFICATE_RENEWED",
        entityType: "Certificate",
        entityId: cert.id,
        metadata: JSON.stringify({
          previousCertNumber: cert.certificateNumber,
          newCertNumber,
          schemeCode: cert.scheme.code,
          cpdHoursLogged,
          expiresAt: expiresAt.toISOString(),
        }),
      },
    }),
  ]);

  // Notify the holder (best-effort — outside transaction)
  await db.notification.create({
    data: {
      userId: cert.userId,
      type: "RENEWAL_REMINDER",
      title: `Certificate Renewed — ${cert.scheme.name}`,
      message:
        `Your ${cert.scheme.name} certificate has been renewed. ` +
        `New certificate number: ${newCertNumber}. Valid until ${expiresAt.toLocaleDateString()}.`,
      link: `/verify/${newCertNumber}`,
    },
  }).catch(() => {});

  return NextResponse.json({ certificate: updatedCert }, { status: 200 });
}
