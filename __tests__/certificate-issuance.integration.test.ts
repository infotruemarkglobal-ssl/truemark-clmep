/**
 * Integration tests — Certificate issuance (POST /api/certificates/generate)
 *
 * Coverage:
 *  a. Non-CO role → 403
 *  b. Trainer conflict (ISO 17024 Cl.7.4 separation of duties) → 403
 *  c. Examiner conflict (graded questions in this attempt) → 403
 *  d. attempt.passed !== true → 422 (cannot approve a failed attempt)
 *  e. Happy path: certificate issued with correct fields
 *  f. CPD hours auto-credited when scheme.cpdHoursRequired > 0
 *  g. Duplicate decision → 409
 *  h. Rejected decision → notification only, no certificate
 *  i. Referred decision → notification only, no certificate
 */

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

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

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
  getCachedSession: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

// Return unique cert numbers to avoid unique-constraint conflicts across tests
jest.mock("@/lib/certificates", () => ({
  generateCertificateNumber: jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve(`TG-TEST-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    ),
  generateOpenBadgeJwt: jest.fn().mockResolvedValue({
    json: { "@context": "https://www.w3.org/ns/credentials/v2" },
    jwt: "test.badge.jwt.token",
  }),
  generateQrCode: jest.fn().mockResolvedValue("https://example.com/test-qr"),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { POST as certPOST } from "@/app/api/certificates/generate/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockAuth = auth as jest.MockedFunction<typeof auth>;

const createdIds = {
  userIds: [] as string[],
  courseIds: [] as string[],
  schemeIds: [] as string[],
  examPaperIds: [] as string[],
};

function makeSession(userId: string, role = "CERTIFICATION_OFFICER") {
  return {
    user: {
      id: userId,
      email: `${userId}@test.example.com`,
      name: "Test User",
      role,
      mfaEnabled: false,
      mfaVerified: true,
      mustChangePassword: false,
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function jsonReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/certificates/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function mkUser(label: string, role = "CANDIDATE"): Promise<string> {
  const user = await db.user.create({
    data: {
      email: `cert-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.example.com`,
      firstName: "Test",
      lastName: label,
      passwordHash: "x",
      role,
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });
  createdIds.userIds.push(user.id);
  return user.id;
}

interface SetupResult {
  schemeId: string;
  courseId: string;
  trainerId: string;
  candidateId: string;
  paperId: string;
  attemptId: string;
}

async function mkFullSetup(opts: {
  cpdHours?: number;
  passed?: boolean;
  trainerAsCreator?: string; // use this user as course creator instead of a new trainer
} = {}): Promise<SetupResult> {
  const trainerId =
    opts.trainerAsCreator ?? (await mkUser(`Trainer-${Math.random().toString(36).slice(2)}`, "TRAINER"));

  const scheme = await db.certificationScheme.create({
    data: {
      code: `CERT-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: "Cert Test Scheme",
      cpdHoursRequired: opts.cpdHours ?? 0,
      validityMonths: 24,
    },
  });
  createdIds.schemeIds.push(scheme.id);

  const course = await db.course.create({
    data: {
      title: "Cert Test Course",
      slug: `cert-course-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      schemeId: scheme.id,
      creatorId: trainerId,
      status: "PUBLISHED",
      price: 0,
    },
  });
  createdIds.courseIds.push(course.id);

  const candidateId = await mkUser(`Candidate-${Math.random().toString(36).slice(2)}`);
  await db.enrolment.create({
    data: { userId: candidateId, courseId: course.id, status: "ACTIVE" },
  });

  const paper = await db.examPaper.create({
    data: {
      title: `Cert Test Paper ${Date.now()}`,
      creatorId: trainerId,
      schemeId: scheme.id,
      isActive: true,
    },
  });
  createdIds.examPaperIds.push(paper.id);

  const attempt = await db.examAttempt.create({
    data: {
      userId: candidateId,
      examPaperId: paper.id,
      status: "COMPLETED",
      passed: opts.passed ?? true,
      rawScore: 80,
      percentageScore: 80,
      attemptNumber: 1,
    },
  });

  return { schemeId: scheme.id, courseId: course.id, trainerId, candidateId, paperId: paper.id, attemptId: attempt.id };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Find all attempts for our users
  const attempts = createdIds.userIds.length
    ? await db.examAttempt.findMany({
        where: { userId: { in: createdIds.userIds } },
        select: { id: true },
      })
    : [];
  const attemptIds = attempts.map((a) => a.id);

  // Find all certification decisions (and thus certificates) for those attempts
  const decisions = attemptIds.length
    ? await db.certificationDecision.findMany({
        where: { attemptId: { in: attemptIds } },
        select: { id: true },
      })
    : [];
  const decisionIds = decisions.map((d) => d.id);

  // Delete in FK-safe order
  if (decisionIds.length) {
    await db.certificate.deleteMany({ where: { decisionId: { in: decisionIds } } });
  }
  if (createdIds.userIds.length) {
    await db.cPDRecord.deleteMany({ where: { userId: { in: createdIds.userIds } } });
    await db.notification.deleteMany({ where: { userId: { in: createdIds.userIds } } });
    await db.auditLog.deleteMany({ where: { userId: { in: createdIds.userIds } } });
    await db.enrolment.deleteMany({ where: { userId: { in: createdIds.userIds } } });
  }
  if (decisionIds.length) {
    await db.certificationDecision.deleteMany({ where: { id: { in: decisionIds } } });
  }
  if (attemptIds.length) {
    await db.examGrade.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await db.examAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  }
  // ExamSection and ExamQuestion cascade from ExamPaper
  if (createdIds.examPaperIds.length) {
    await db.examPaper.deleteMany({ where: { id: { in: createdIds.examPaperIds } } });
  }
  if (createdIds.courseIds.length) {
    await db.course.deleteMany({ where: { id: { in: createdIds.courseIds } } });
  }
  if (createdIds.schemeIds.length) {
    await db.certificationScheme.deleteMany({ where: { id: { in: createdIds.schemeIds } } });
  }
  if (createdIds.userIds.length) {
    await db.user.deleteMany({ where: { id: { in: createdIds.userIds } } });
  }

  await (db as unknown as { $disconnect(): Promise<void> }).$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// a. Non-CO role
// ═════════════════════════════════════════════════════════════════════════════

describe("a. Non-CO role — forbidden", () => {
  it("returns 403 for CANDIDATE role", async () => {
    const candidateId = await mkUser("RoleCandidate", "CANDIDATE");
    mockAuth.mockResolvedValue(makeSession(candidateId, "CANDIDATE") as never);

    const res = await certPOST(
      jsonReq({ attemptId: "fake", decision: "approved", justification: "x".repeat(15) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for TRAINER role", async () => {
    const trainerId = await mkUser("RoleTrainer", "TRAINER");
    mockAuth.mockResolvedValue(makeSession(trainerId, "TRAINER") as never);

    const res = await certPOST(
      jsonReq({ attemptId: "fake", decision: "approved", justification: "x".repeat(15) }),
    );
    expect(res.status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// b. Trainer conflict — ISO 17024 Cl.7.4 separation of duties
// ═════════════════════════════════════════════════════════════════════════════

describe("b. Trainer conflict — CO created a course the candidate is enrolled in", () => {
  let coId: string;
  let attemptId: string;

  beforeAll(async () => {
    // The CO also plays the role of trainer (course creator) — this is the conflict
    coId = await mkUser("TrainerCO", "CERTIFICATION_OFFICER");
    // Create setup using the CO as course creator
    const setup = await mkFullSetup({ trainerAsCreator: coId });
    attemptId = setup.attemptId;
  });

  it("returns 403 with separation-of-duties error", async () => {
    mockAuth.mockResolvedValue(makeSession(coId) as never);
    const res = await certPOST(
      jsonReq({ attemptId, decision: "approved", justification: "All criteria met." }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/trainer/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// c. Examiner conflict — CO graded questions in this attempt
// ═════════════════════════════════════════════════════════════════════════════

describe("c. Examiner conflict — CO has ExamGrade record for the attempt", () => {
  let coId: string;
  let attemptId: string;

  beforeAll(async () => {
    coId = await mkUser("ExaminerCO", "CERTIFICATION_OFFICER");
    const setup = await mkFullSetup();
    attemptId = setup.attemptId;

    // Create an ExamGrade for the attempt with the CO as examiner
    await db.examGrade.create({
      data: {
        attemptId,
        examinerId: coId,
        rawScore: 80,
        percentageScore: 80,
        passed: true,
      },
    });
  });

  it("returns 403 with examiner-conflict error", async () => {
    mockAuth.mockResolvedValue(makeSession(coId) as never);
    const res = await certPOST(
      jsonReq({ attemptId, decision: "approved", justification: "All criteria met." }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/examiner/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// d. passed !== true — cannot approve a failed attempt
// ═════════════════════════════════════════════════════════════════════════════

describe("d. passed !== true — returns 422", () => {
  let coId: string;
  let attemptId: string;

  beforeAll(async () => {
    coId = await mkUser("FailCO", "CERTIFICATION_OFFICER");
    const setup = await mkFullSetup({ passed: false });
    attemptId = setup.attemptId;
  });

  it("returns 422 when attempt.passed is false", async () => {
    mockAuth.mockResolvedValue(makeSession(coId) as never);
    const res = await certPOST(
      jsonReq({ attemptId, decision: "approved", justification: "Passing this candidate." }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/passed/i);
  });

  it("does not create a Certificate record", async () => {
    const decision = await db.certificationDecision.findFirst({ where: { attemptId } });
    // A decision IS created (TOCTOU fix commits it before the passed check)
    expect(decision).not.toBeNull();
    // But no certificate should exist for this decision
    const cert = decision
      ? await db.certificate.findFirst({ where: { decisionId: decision.id } })
      : null;
    expect(cert).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// e. Happy path — certificate issued with correct fields
// ═════════════════════════════════════════════════════════════════════════════

describe("e. Happy path — certificate issued", () => {
  let coId: string;
  let candidateId: string;
  let attemptId: string;
  let schemeId: string;

  beforeAll(async () => {
    coId = await mkUser("HappyCO", "CERTIFICATION_OFFICER");
    const setup = await mkFullSetup();
    candidateId = setup.candidateId;
    attemptId = setup.attemptId;
    schemeId = setup.schemeId;
  });

  it("returns 201 with the certificate record", async () => {
    mockAuth.mockResolvedValue(makeSession(coId) as never);
    const res = await certPOST(
      jsonReq({ attemptId, decision: "approved", justification: "Candidate met all criteria." }),
    );
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.certificate).toBeDefined();
    expect(json.certificate.status).toBe("ACTIVE");
    expect(json.certificate.userId).toBe(candidateId);
    expect(json.certificate.schemeId).toBe(schemeId);
  });

  it("certificate in DB has correct snapshot fields and expiresAt set", async () => {
    const cert = await db.certificate.findFirst({ where: { userId: candidateId } });
    expect(cert).not.toBeNull();
    expect(cert!.certificateNumber).toMatch(/^TG-TEST-/); // from mock
    expect(cert!.expiresAt).not.toBeNull();
    expect(cert!.openBadgeJwt).toBe("test.badge.jwt.token");
    expect(cert!.qrCodeUrl).toBe("https://example.com/test-qr");
    expect(cert!.schemeNameSnapshot).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// f. CPD auto-credit
// ═════════════════════════════════════════════════════════════════════════════

describe("f. CPD auto-credited when scheme.cpdHoursRequired > 0", () => {
  let coId: string;
  let candidateId: string;
  let attemptId: string;
  let schemeId: string;

  beforeAll(async () => {
    coId = await mkUser("CpdCO", "CERTIFICATION_OFFICER");
    const setup = await mkFullSetup({ cpdHours: 8 }); // 8 CPD hours required
    candidateId = setup.candidateId;
    attemptId = setup.attemptId;
    schemeId = setup.schemeId;
  });

  it("creates a CPDRecord with hoursLogged=8 after cert issuance", async () => {
    mockAuth.mockResolvedValue(makeSession(coId) as never);
    await certPOST(
      jsonReq({ attemptId, decision: "approved", justification: "CPD requirement acknowledged." }),
    );

    const cpdRecord = await db.cPDRecord.findFirst({
      where: { userId: candidateId, schemeId },
    });
    expect(cpdRecord).not.toBeNull();
    expect(cpdRecord!.hoursLogged).toBe(8);
    expect(cpdRecord!.type).toBe("course_completion");
    expect(cpdRecord!.status).toBe("approved");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// g. Duplicate decision
// ═════════════════════════════════════════════════════════════════════════════

describe("g. Duplicate decision — second request returns 409", () => {
  let coId: string;
  let attemptId: string;

  beforeAll(async () => {
    coId = await mkUser("DupCO", "CERTIFICATION_OFFICER");
    const setup = await mkFullSetup();
    attemptId = setup.attemptId;

    // First decision — should succeed
    mockAuth.mockResolvedValue(makeSession(coId) as never);
    await certPOST(
      jsonReq({ attemptId, decision: "approved", justification: "First decision — approved." }),
    );
  });

  it("returns 409 on second request for the same attempt", async () => {
    mockAuth.mockResolvedValue(makeSession(coId) as never);
    const res = await certPOST(
      jsonReq({ attemptId, decision: "approved", justification: "Trying again." }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// h. Rejected decision
// ═════════════════════════════════════════════════════════════════════════════

describe("h. Rejected decision — notification sent, no certificate", () => {
  let coId: string;
  let candidateId: string;
  let attemptId: string;

  beforeAll(async () => {
    coId = await mkUser("RejCO", "CERTIFICATION_OFFICER");
    const setup = await mkFullSetup();
    candidateId = setup.candidateId;
    attemptId = setup.attemptId;
  });

  it("returns 200 with decision=rejected and no certificate", async () => {
    mockAuth.mockResolvedValue(makeSession(coId) as never);
    const res = await certPOST(
      jsonReq({ attemptId, decision: "rejected", justification: "Candidate did not meet the standard." }),
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.decision).toBe("rejected");
    expect(json).not.toHaveProperty("certificate");
  });

  it("no Certificate record created for rejected decision", async () => {
    const decision = await db.certificationDecision.findFirst({ where: { attemptId } });
    const cert = decision
      ? await db.certificate.findFirst({ where: { decisionId: decision.id } })
      : null;
    expect(cert).toBeNull();
  });

  it("creates a notification for the candidate", async () => {
    const notification = await db.notification.findFirst({
      where: { userId: candidateId, type: "SYSTEM_ALERT" },
    });
    expect(notification).not.toBeNull();
    expect(notification!.title).toMatch(/not awarded/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// i. Referred decision
// ═════════════════════════════════════════════════════════════════════════════

describe("i. Referred decision — notification sent, no certificate", () => {
  let coId: string;
  let candidateId: string;
  let attemptId: string;

  beforeAll(async () => {
    coId = await mkUser("RefCO", "CERTIFICATION_OFFICER");
    const setup = await mkFullSetup();
    candidateId = setup.candidateId;
    attemptId = setup.attemptId;
  });

  it("returns 200 with decision=referred and no certificate", async () => {
    mockAuth.mockResolvedValue(makeSession(coId) as never);
    const res = await certPOST(
      jsonReq({ attemptId, decision: "referred", justification: "Further review required — escalating." }),
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.decision).toBe("referred");
    expect(json).not.toHaveProperty("certificate");
  });

  it("creates a notification indicating the application is under review", async () => {
    const notification = await db.notification.findFirst({
      where: { userId: candidateId, type: "SYSTEM_ALERT" },
    });
    expect(notification).not.toBeNull();
    expect(notification!.title).toMatch(/review/i);
  });
});
