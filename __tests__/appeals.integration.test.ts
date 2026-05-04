/**
 * Integration tests — Appeals (POST /api/appeals, GET /api/appeals,
 *                              PATCH /api/appeals/[id])
 *
 * Coverage:
 *  a. POST — unauthorized → 401
 *  b. POST — invalid body → 400
 *  c. POST — happy path → 201, SUBMITTED status, reference generated
 *  d. GET  — candidate sees only own appeals
 *  e. GET  — admin sees all appeals
 *  f. PATCH — non-admin → 403
 *  g. PATCH — invalid transition → 422
 *  h. PATCH — valid transition SUBMITTED → UNDER_REVIEW → 200
 *  i. PATCH — already finalised (RESOLVED) → 409
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

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { GET as appealGET, POST as appealPOST } from "@/app/api/appeals/route";
import { PATCH as appealPATCH } from "@/app/api/appeals/[id]/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;

const cleanup = { userIds: [] as string[], appealIds: [] as string[] };

function makeSession(userId: string, role = "CANDIDATE") {
  return {
    user: { id: userId, email: `${userId}@appeals.test`, name: "Test", role, mfaEnabled: false, mfaVerified: true, mustChangePassword: false },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

async function mkUser(tag: string, role = "CANDIDATE") {
  const u = await db.user.create({
    data: {
      email: `${tag.toLowerCase().replace(/\s/g, "-")}-${Date.now()}@appeals.test`,
      firstName: tag,
      lastName: "User",
      role,
      status: "ACTIVE",
    },
  });
  cleanup.userIds.push(u.id);
  return u.id;
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/appeals", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function patchReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/appeals/test", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

afterAll(async () => {
  await db.appeal.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.auditLog.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// a. Unauthorized
// ─────────────────────────────────────────────────────────────────────────────
describe("a. POST — unauthorized", () => {
  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await appealPOST(postReq({ type: "exam_result", description: "x".repeat(25) }));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// b. Invalid body
// ─────────────────────────────────────────────────────────────────────────────
describe("b. POST — invalid body", () => {
  let userId: string;
  beforeAll(async () => { userId = await mkUser("BadAppeal"); });

  it("returns 400 for invalid type", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await appealPOST(postReq({ type: "invalid_type", description: "x".repeat(25) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when description too short", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await appealPOST(postReq({ type: "exam_result", description: "Too short" }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// c. Happy path POST
// ─────────────────────────────────────────────────────────────────────────────
describe("c. POST — happy path", () => {
  let userId: string;
  let createdAppealId: string;

  beforeAll(async () => { userId = await mkUser("HappyAppeal"); });

  it("returns 201 with SUBMITTED status and reference", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await appealPOST(
      postReq({
        type: "certification_decision",
        description: "I believe my exam result was graded incorrectly and I wish to appeal.",
        evidenceUrls: ["https://example.com/evidence.pdf"],
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("SUBMITTED");
    expect(json.reference).toMatch(/^APL-/);
    expect(json.userId).toBe(userId);
    createdAppealId = json.id;
    cleanup.appealIds.push(createdAppealId);
  });

  it("appeal has a 28-day dueAt SLA", async () => {
    const appeal = await db.appeal.findUnique({ where: { id: createdAppealId } });
    expect(appeal?.dueAt).not.toBeNull();
    const daysFromNow = (appeal!.dueAt!.getTime() - Date.now()) / 86400000;
    expect(daysFromNow).toBeGreaterThan(27);
    expect(daysFromNow).toBeLessThan(29);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// d. GET — candidate sees only own
// ─────────────────────────────────────────────────────────────────────────────
describe("d. GET — candidate sees only own appeals", () => {
  let user1Id: string;
  let user2Id: string;

  beforeAll(async () => {
    user1Id = await mkUser("OwnAppeal1");
    user2Id = await mkUser("OwnAppeal2");
    mockAuth.mockResolvedValue(makeSession(user1Id) as never);
    await appealPOST(postReq({ type: "exam_result", description: "My appeal for exam result reconsideration test." }));
  });

  it("candidate only sees their own appeals", async () => {
    mockAuth.mockResolvedValue(makeSession(user1Id) as never);
    const res = await appealGET(new NextRequest("http://localhost/api/appeals"));
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.every((a: { userId: string }) => a.userId === user1Id)).toBe(true);
  });

  it("user2 GET returns empty list (no appeals)", async () => {
    mockAuth.mockResolvedValue(makeSession(user2Id) as never);
    const res = await appealGET(new NextRequest("http://localhost/api/appeals"));
    const json = await res.json();
    expect(json).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// e. GET — admin sees all
// ─────────────────────────────────────────────────────────────────────────────
describe("e. GET — admin sees all appeals", () => {
  let adminId: string;
  let candidateId: string;

  beforeAll(async () => {
    adminId = await mkUser("AdminSees", "SUPER_ADMIN");
    candidateId = await mkUser("AdminCandSees");
    mockAuth.mockResolvedValue(makeSession(candidateId) as never);
    await appealPOST(postReq({ type: "other", description: "Admin visibility test appeal description here." }));
  });

  it("admin sees appeals from all users", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId, "SUPER_ADMIN") as never);
    const res = await appealGET(new NextRequest("http://localhost/api/appeals"));
    const json = await res.json();
    const found = json.some((a: { userId: string }) => a.userId === candidateId);
    expect(found).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// f. PATCH — non-admin forbidden
// ─────────────────────────────────────────────────────────────────────────────
describe("f. PATCH — non-admin forbidden", () => {
  let candidateId: string;
  let appealId: string;

  beforeAll(async () => {
    candidateId = await mkUser("PatchCand");
    const appeal = await db.appeal.create({
      data: {
        reference: `APL-TEST-${Date.now()}`,
        userId: candidateId,
        type: "exam_result",
        description: "Test appeal for PATCH auth check",
        status: "SUBMITTED",
      },
    });
    appealId = appeal.id;
    cleanup.appealIds.push(appealId);
  });

  it("returns 403 for CANDIDATE role", async () => {
    mockAuth.mockResolvedValue(makeSession(candidateId) as never);
    const res = await appealPATCH(patchReq({ status: "UNDER_REVIEW" }), { params: Promise.resolve({ id: appealId }) });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// g. PATCH — invalid transition
// ─────────────────────────────────────────────────────────────────────────────
describe("g. PATCH — invalid transition rejected", () => {
  let adminId: string;
  let appealId: string;

  beforeAll(async () => {
    adminId = await mkUser("TransAdmin", "CERTIFICATION_OFFICER");
    const candidateId = await mkUser("TransCand");
    const appeal = await db.appeal.create({
      data: {
        reference: `APL-TRANS-${Date.now()}`,
        userId: candidateId,
        type: "other",
        description: "Test for invalid transition",
        status: "SUBMITTED",
      },
    });
    appealId = appeal.id;
    cleanup.appealIds.push(appealId);
  });

  it("returns 422 for SUBMITTED → RESOLVED (skips UNDER_REVIEW)", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId, "CERTIFICATION_OFFICER") as never);
    const res = await appealPATCH(
      patchReq({ status: "RESOLVED", resolution: "Resolved without review" }),
      { params: Promise.resolve({ id: appealId }) },
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/invalid transition/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// h. PATCH — valid transition
// ─────────────────────────────────────────────────────────────────────────────
describe("h. PATCH — valid transition SUBMITTED → UNDER_REVIEW → RESOLVED", () => {
  let adminId: string;
  let appealId: string;

  beforeAll(async () => {
    adminId = await mkUser("ValidTransAdmin", "SUPER_ADMIN");
    const candidateId = await mkUser("ValidTransCand");
    const appeal = await db.appeal.create({
      data: {
        reference: `APL-VALID-${Date.now()}`,
        userId: candidateId,
        type: "misconduct_finding",
        description: "Valid transition test",
        status: "SUBMITTED",
      },
    });
    appealId = appeal.id;
    cleanup.appealIds.push(appealId);
  });

  it("SUBMITTED → UNDER_REVIEW succeeds", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId, "SUPER_ADMIN") as never);
    const res = await appealPATCH(patchReq({ status: "UNDER_REVIEW" }), { params: Promise.resolve({ id: appealId }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("UNDER_REVIEW");
  });

  it("UNDER_REVIEW → RESOLVED succeeds", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId, "SUPER_ADMIN") as never);
    const res = await appealPATCH(
      patchReq({ status: "RESOLVED", resolution: "Appeal upheld after review" }),
      { params: Promise.resolve({ id: appealId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("RESOLVED");
    expect(json.resolvedAt).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// i. PATCH — already finalised → 409
// ─────────────────────────────────────────────────────────────────────────────
describe("i. PATCH — already finalised appeal returns 409", () => {
  let adminId: string;
  let appealId: string;

  beforeAll(async () => {
    adminId = await mkUser("FinalAdmin", "CERTIFICATION_OFFICER");
    const candidateId = await mkUser("FinalCand");
    const appeal = await db.appeal.create({
      data: {
        reference: `APL-FINAL-${Date.now()}`,
        userId: candidateId,
        type: "exam_result",
        description: "Already finalised appeal",
        status: "RESOLVED",
      },
    });
    appealId = appeal.id;
    cleanup.appealIds.push(appealId);
  });

  it("returns 409 when trying to update a RESOLVED appeal", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId, "CERTIFICATION_OFFICER") as never);
    const res = await appealPATCH(patchReq({ status: "CLOSED" }), { params: Promise.resolve({ id: appealId }) });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/finalised/i);
  });
});
