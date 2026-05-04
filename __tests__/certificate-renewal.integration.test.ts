/**
 * Integration tests — Certificate renewal (GET + POST /api/certificates/[id]/renew)
 *
 * Coverage:
 *  a. GET eligibility check — candidate sees own cert, officers see any
 *  b. POST action=request — outside 180-day window → 422
 *  c. POST action=request — in window → 200, notifications for officers
 *  d. POST action=request — REVOKED cert → 422
 *  e. POST action=issue — non-CO → 403
 *  f. POST action=issue — CPD requirement not met → 422
 *  g. POST action=issue — happy path → 200, cert updated, CertificateRenewal created
 *  h. POST action=issue — zero CPD required → 200 (no CPD gate)
 */

jest.mock("@/lib/db", () => {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  require("dotenv").config();
  const url =
    process.env.TEST_DATABASE_URL ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    "";
  const adapter = new PrismaPg({ connectionString: url });
  return { db: new PrismaClient({ adapter }) };
});

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/certificates", () => ({
  generateCertificateNumber: jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve(`TG-RNW-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    ),
  generateOpenBadgeJwt: jest.fn().mockResolvedValue({
    json: { "@context": "https://www.w3.org/ns/credentials/v2" },
    jwt: "renewed.badge.jwt",
  }),
  generateQrCode: jest.fn().mockResolvedValue("https://example.com/renew-qr"),
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  GET as renewGET,
  POST as renewPOST,
} from "@/app/api/certificates/[id]/renew/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;

// ── IDs to clean up after all tests ──────────────────────────────────────────
const cleanup = {
  userIds: [] as string[],
  schemeIds: [] as string[],
  paperIds: [] as string[],
};

function makeSession(userId: string, role = "CANDIDATE") {
  return {
    user: { id: userId, email: `${userId}@renew.test`, name: "Test", role, mfaEnabled: false, mfaVerified: true, mustChangePassword: false },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

async function mkUser(tag: string, role = "CANDIDATE") {
  const u = await db.user.create({
    data: {
      email: `${tag.toLowerCase().replace(/\s/g, "-")}-${Date.now()}@renew.test`,
      firstName: tag,
      lastName: "Test",
      role,
      status: "ACTIVE",
    },
  });
  cleanup.userIds.push(u.id);
  return u.id;
}

async function mkScheme(opts: { cpdHoursRequired?: number; validityMonths?: number } = {}) {
  const code = `RNW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const s = await db.certificationScheme.create({
    data: {
      name: `Renewal Scheme ${code}`,
      code,
      validityMonths: opts.validityMonths ?? 24,
      cpdHoursRequired: opts.cpdHoursRequired ?? 0,
      isActive: true,
    },
  });
  cleanup.schemeIds.push(s.id);
  return s;
}

async function mkPaper(creatorId: string, schemeId: string) {
  const p = await db.examPaper.create({
    data: {
      title: `Renewal Paper ${Date.now()}`,
      durationMins: 60,
      passMark: 70,
      totalMarks: 100,
      creatorId,
      schemeId,
    },
  });
  cleanup.paperIds.push(p.id);
  return p;
}

async function mkCert(opts: {
  holderId: string;
  officerId: string;
  schemeId: string;
  paperId: string;
  expiresInDays?: number;
  status?: string;
}) {
  const attempt = await db.examAttempt.create({
    data: {
      userId: opts.holderId,
      examPaperId: opts.paperId,
      status: "COMPLETED",
      passed: true,
      attemptNumber: 1,
    },
  });
  const decision = await db.certificationDecision.create({
    data: {
      attemptId: attempt.id,
      certificationOfficerId: opts.officerId,
      decision: "approved",
      justification: "Approved for renewal test",
    },
  });
  const now = new Date();
  const days = opts.expiresInDays ?? 30;
  const expiresAt = new Date(now.getTime() + days * 86400000);
  const cert = await db.certificate.create({
    data: {
      userId: opts.holderId,
      schemeId: opts.schemeId,
      decisionId: decision.id,
      certificateNumber: `TG-RNW-SEED-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: opts.status ?? "ACTIVE",
      issuedAt: new Date(now.getTime() - 700 * 86400000),
      expiresAt,
      openBadgeJson: "{}",
      openBadgeJwt: "seed.jwt",
      qrCodeUrl: "https://example.com/qr",
      schemeNameSnapshot: "Renewal Scheme",
      schemeCodeSnapshot: "RNW-SEED",
      standardVersion: "ISO/IEC 17024:2012",
      examPaperTitleSnapshot: "Renewal Paper",
    },
  });
  return { cert, attempt, decision };
}

function renewReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/certificates/test/renew", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

afterAll(async () => {
  // Delete in FK-safe order
  await db.certificateRenewal.deleteMany({ where: { certificate: { schemeId: { in: cleanup.schemeIds } } } });
  await db.notification.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.auditLog.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.cPDRecord.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.certificate.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.certificationDecision.deleteMany({ where: { certificationOfficerId: { in: cleanup.userIds } } });
  await db.examAttempt.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.examPaper.deleteMany({ where: { id: { in: cleanup.paperIds } } });
  await db.certificationScheme.deleteMany({ where: { id: { in: cleanup.schemeIds } } });
  await db.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// a. GET eligibility
// ─────────────────────────────────────────────────────────────────────────────
describe("a. GET eligibility check", () => {
  let holderId: string;
  let officerId: string;
  let certId: string;

  beforeAll(async () => {
    holderId = await mkUser("GetHolder");
    officerId = await mkUser("GetOfficer", "CERTIFICATION_OFFICER");
    const scheme = await mkScheme({ cpdHoursRequired: 5 });
    const paper = await mkPaper(officerId, scheme.id);
    const { cert } = await mkCert({ holderId, officerId, schemeId: scheme.id, paperId: paper.id, expiresInDays: 30 });
    certId = cert.id;
  });

  it("candidate sees own certificate", async () => {
    mockAuth.mockResolvedValue(makeSession(holderId) as never);
    const res = await renewGET(
      new NextRequest(`http://localhost/api/certificates/${certId}/renew`),
      { params: Promise.resolve({ id: certId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.certificate.id).toBe(certId);
    expect(json.renewal.inRenewalWindow).toBe(true);
    expect(json.cpd.required).toBe(5);
  });

  it("officer sees any certificate", async () => {
    mockAuth.mockResolvedValue(makeSession(officerId, "CERTIFICATION_OFFICER") as never);
    const res = await renewGET(
      new NextRequest(`http://localhost/api/certificates/${certId}/renew`),
      { params: Promise.resolve({ id: certId }) },
    );
    expect(res.status).toBe(200);
  });

  it("candidate cannot see another user's certificate", async () => {
    const otherId = await mkUser("OtherHolder");
    mockAuth.mockResolvedValue(makeSession(otherId) as never);
    const res = await renewGET(
      new NextRequest(`http://localhost/api/certificates/${certId}/renew`),
      { params: Promise.resolve({ id: certId }) },
    );
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// b. action=request — outside 180-day window
// ─────────────────────────────────────────────────────────────────────────────
describe("b. POST action=request — outside renewal window", () => {
  let holderId: string;
  let certId: string;

  beforeAll(async () => {
    holderId = await mkUser("OutsideHolder");
    const officerId = await mkUser("OutsideOfficer", "CERTIFICATION_OFFICER");
    const scheme = await mkScheme();
    const paper = await mkPaper(officerId, scheme.id);
    // Expires in 200 days — outside 180-day window
    const { cert } = await mkCert({ holderId, officerId, schemeId: scheme.id, paperId: paper.id, expiresInDays: 200 });
    certId = cert.id;
  });

  it("returns 422 when outside renewal window", async () => {
    mockAuth.mockResolvedValue(makeSession(holderId) as never);
    const res = await renewPOST(renewReq({ action: "request" }), { params: Promise.resolve({ id: certId }) });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/renewal requests open/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// c. action=request — in window → notifications for officers
// ─────────────────────────────────────────────────────────────────────────────
describe("c. POST action=request — in renewal window", () => {
  let holderId: string;
  let officerId: string;
  let certId: string;

  beforeAll(async () => {
    holderId = await mkUser("InWindowHolder");
    officerId = await mkUser("InWindowOfficer", "CERTIFICATION_OFFICER");
    const scheme = await mkScheme();
    const paper = await mkPaper(officerId, scheme.id);
    // Expires in 30 days — well inside 180-day window
    const { cert } = await mkCert({ holderId, officerId, schemeId: scheme.id, paperId: paper.id, expiresInDays: 30 });
    certId = cert.id;
  });

  it("returns 200 and creates notifications for officers", async () => {
    mockAuth.mockResolvedValue(makeSession(holderId) as never);
    const res = await renewPOST(
      renewReq({ action: "request", notes: "Please review" }),
      { params: Promise.resolve({ id: certId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.action).toBe("requested");

    const notif = await db.notification.findFirst({
      where: { userId: officerId, type: "RENEWAL_REMINDER" },
    });
    expect(notif).not.toBeNull();
    expect(notif!.message).toContain("Please review");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// d. action=request — REVOKED cert
// ─────────────────────────────────────────────────────────────────────────────
describe("d. POST action=request — REVOKED certificate", () => {
  let holderId: string;
  let certId: string;

  beforeAll(async () => {
    holderId = await mkUser("RevokedHolder");
    const officerId = await mkUser("RevokedOfficer", "CERTIFICATION_OFFICER");
    const scheme = await mkScheme();
    const paper = await mkPaper(officerId, scheme.id);
    const { cert } = await mkCert({
      holderId,
      officerId,
      schemeId: scheme.id,
      paperId: paper.id,
      expiresInDays: 30,
      status: "REVOKED",
    });
    certId = cert.id;
  });

  it("returns 422 for a revoked certificate", async () => {
    mockAuth.mockResolvedValue(makeSession(holderId) as never);
    const res = await renewPOST(renewReq({ action: "request" }), { params: Promise.resolve({ id: certId }) });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/revoked/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// e. action=issue — non-CO forbidden
// ─────────────────────────────────────────────────────────────────────────────
describe("e. POST action=issue — non-CO forbidden", () => {
  let holderId: string;
  let certId: string;

  beforeAll(async () => {
    holderId = await mkUser("IssueCandidate");
    const officerId = await mkUser("IssueOfficer2", "CERTIFICATION_OFFICER");
    const scheme = await mkScheme();
    const paper = await mkPaper(officerId, scheme.id);
    const { cert } = await mkCert({ holderId, officerId, schemeId: scheme.id, paperId: paper.id, expiresInDays: 30 });
    certId = cert.id;
  });

  it("returns 403 when CANDIDATE tries to issue", async () => {
    mockAuth.mockResolvedValue(makeSession(holderId, "CANDIDATE") as never);
    const res = await renewPOST(renewReq({ action: "issue" }), { params: Promise.resolve({ id: certId }) });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// f. action=issue — CPD not met
// ─────────────────────────────────────────────────────────────────────────────
describe("f. POST action=issue — CPD requirement not met", () => {
  let holderId: string;
  let officerId: string;
  let certId: string;

  beforeAll(async () => {
    holderId = await mkUser("CpdShortHolder");
    officerId = await mkUser("CpdShortOfficer", "CERTIFICATION_OFFICER");
    const scheme = await mkScheme({ cpdHoursRequired: 10 }); // requires 10h
    const paper = await mkPaper(officerId, scheme.id);
    const { cert } = await mkCert({ holderId, officerId, schemeId: scheme.id, paperId: paper.id, expiresInDays: 30 });
    certId = cert.id;
    // Add only 3h of CPD (short of 10h)
    await db.cPDRecord.create({
      data: {
        userId: holderId,
        schemeId: scheme.id,
        title: "Short CPD",
        type: "course_completion",
        hoursLogged: 3,
        activityDate: new Date(),
        status: "approved",
      },
    });
  });

  it("returns 422 with shortfall when CPD not met", async () => {
    mockAuth.mockResolvedValue(makeSession(officerId, "CERTIFICATION_OFFICER") as never);
    const res = await renewPOST(renewReq({ action: "issue" }), { params: Promise.resolve({ id: certId }) });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/cpd/i);
    expect(json.shortfall).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// g. action=issue — happy path
// ─────────────────────────────────────────────────────────────────────────────
describe("g. POST action=issue — happy path", () => {
  let holderId: string;
  let officerId: string;
  let certId: string;
  let originalCertNumber: string;
  let schemeId: string;

  beforeAll(async () => {
    holderId = await mkUser("IssueHolder");
    officerId = await mkUser("IssueOfficerHappy", "CERTIFICATION_OFFICER");
    const scheme = await mkScheme({ cpdHoursRequired: 5, validityMonths: 24 });
    schemeId = scheme.id;
    const paper = await mkPaper(officerId, scheme.id);
    const { cert } = await mkCert({ holderId, officerId, schemeId: scheme.id, paperId: paper.id, expiresInDays: 30 });
    certId = cert.id;
    originalCertNumber = cert.certificateNumber;
    // Fulfil CPD
    await db.cPDRecord.create({
      data: {
        userId: holderId,
        schemeId: scheme.id,
        title: "Full CPD",
        type: "conference",
        hoursLogged: 6,
        activityDate: new Date(),
        status: "approved",
      },
    });
  });

  it("returns 200 with updated certificate", async () => {
    mockAuth.mockResolvedValue(makeSession(officerId, "CERTIFICATION_OFFICER") as never);
    const res = await renewPOST(
      renewReq({ action: "issue", notes: "Renewal approved" }),
      { params: Promise.resolve({ id: certId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.certificate).toBeDefined();
    expect(json.certificate.certificateNumber).not.toBe(originalCertNumber);
  });

  it("creates a CertificateRenewal record", async () => {
    const renewal = await db.certificateRenewal.findFirst({
      where: { certificateId: certId },
    });
    expect(renewal).not.toBeNull();
    expect(renewal!.cpdHoursLogged).toBe(6);
    expect(renewal!.notes).toBe("Renewal approved");
  });

  it("cert in DB has new expiry date and badge data", async () => {
    const cert = await db.certificate.findUnique({ where: { id: certId } });
    expect(cert).not.toBeNull();
    expect(cert!.certificateNumber).not.toBe(originalCertNumber);
    expect(cert!.openBadgeJwt).toBe("renewed.badge.jwt");
    expect(cert!.expiresAt).not.toBeNull();
    expect(cert!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("holder receives a renewal notification", async () => {
    const notif = await db.notification.findFirst({
      where: { userId: holderId, type: "RENEWAL_REMINDER" },
    });
    expect(notif).not.toBeNull();
    expect(notif!.title).toMatch(/renewed/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// h. action=issue — scheme with zero CPD required
// ─────────────────────────────────────────────────────────────────────────────
describe("h. POST action=issue — zero CPD required passes immediately", () => {
  let holderId: string;
  let officerId: string;
  let certId: string;

  beforeAll(async () => {
    holderId = await mkUser("ZeroCpdHolder");
    officerId = await mkUser("ZeroCpdOfficer", "CERTIFICATION_OFFICER");
    const scheme = await mkScheme({ cpdHoursRequired: 0 });
    const paper = await mkPaper(officerId, scheme.id);
    const { cert } = await mkCert({ holderId, officerId, schemeId: scheme.id, paperId: paper.id, expiresInDays: 30 });
    certId = cert.id;
  });

  it("returns 200 without CPD records", async () => {
    mockAuth.mockResolvedValue(makeSession(officerId, "CERTIFICATION_OFFICER") as never);
    const res = await renewPOST(renewReq({ action: "issue" }), { params: Promise.resolve({ id: certId }) });
    expect(res.status).toBe(200);
  });
});
