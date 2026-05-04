/**
 * Integration tests — CPD (POST /api/cpd, GET /api/cpd,
 *                          GET/PATCH/DELETE /api/cpd/[id])
 *
 * Coverage:
 *  a. POST — no CPD_TRACKING consent → 403
 *  b. POST — consent withdrawn → 403
 *  c. POST — valid consent → 201
 *  d. GET  — returns own records only
 *  e. GET /api/cpd/[id] — own record → 200
 *  f. GET /api/cpd/[id] — another user's record → 403
 *  g. PATCH — non-admin → 403
 *  h. PATCH — admin approves → 200 with reviewNote, auditLog called
 *  i. PATCH — admin rejects → 200
 *  j. DELETE — own pending record → 200
 *  k. DELETE — own approved record → 409
 *  l. DELETE — another user's record → 403
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
jest.mock("@/lib/rate-limit", () => ({
  rateLimit: jest.fn().mockResolvedValue({ success: true, retryAfterSecs: 0 }),
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { GET as cpdGET, POST as cpdPOST } from "@/app/api/cpd/route";
import {
  GET as cpdIdGET,
  PATCH as cpdIdPATCH,
  DELETE as cpdIdDELETE,
} from "@/app/api/cpd/[id]/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockAuditLog = auditLog as jest.MockedFunction<typeof auditLog>;

const cleanup = {
  userIds: [] as string[],
  schemeIds: [] as string[],
  cpdRecordIds: [] as string[],
  consentIds: [] as string[],
};

function makeSession(userId: string, role = "CANDIDATE") {
  return {
    user: { id: userId, email: `${userId}@cpd.test`, name: "Test", role, mfaEnabled: false, mfaVerified: true, mustChangePassword: false },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

async function mkUser(tag: string, role = "CANDIDATE") {
  const u = await db.user.create({
    data: {
      email: `${tag.toLowerCase().replace(/\s/g, "-")}-${Date.now()}@cpd.test`,
      firstName: tag,
      lastName: "User",
      role,
      status: "ACTIVE",
    },
  });
  cleanup.userIds.push(u.id);
  return u.id;
}

async function grantConsent(userId: string, granted = true, withdrawnAt: Date | null = null) {
  const c = await db.consentRecord.create({
    data: { userId, purpose: "CPD_TRACKING", granted, withdrawnAt },
  });
  cleanup.consentIds.push(c.id);
  return c;
}

async function mkScheme() {
  const code = `CPD-SCH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const s = await db.certificationScheme.create({
    data: { name: `CPD Scheme ${code}`, code, validityMonths: 24, isActive: true },
  });
  cleanup.schemeIds.push(s.id);
  return s;
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/cpd", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validCpdBody = {
  title: "ISO 9001 Conference",
  type: "conference",
  hoursLogged: 4,
  activityDate: new Date().toISOString(),
};

afterAll(async () => {
  await db.cPDRecord.deleteMany({ where: { id: { in: cleanup.cpdRecordIds } } });
  await db.cPDRecord.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.consentRecord.deleteMany({ where: { id: { in: cleanup.consentIds } } });
  await db.auditLog.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.certificationScheme.deleteMany({ where: { id: { in: cleanup.schemeIds } } });
  await db.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// a. POST — no consent
// ─────────────────────────────────────────────────────────────────────────────
describe("a. POST — no CPD_TRACKING consent", () => {
  let userId: string;
  beforeAll(async () => { userId = await mkUser("NoConsentUser"); });

  it("returns 403 when no consent record exists", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await cpdPOST(postReq(validCpdBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/consent/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// b. POST — consent withdrawn
// ─────────────────────────────────────────────────────────────────────────────
describe("b. POST — consent withdrawn", () => {
  let userId: string;
  beforeAll(async () => {
    userId = await mkUser("WithdrawnUser");
    await grantConsent(userId, false, new Date());
  });

  it("returns 403 when consent has been withdrawn", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await cpdPOST(postReq(validCpdBody));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// c. POST — valid consent → 201
// ─────────────────────────────────────────────────────────────────────────────
describe("c. POST — valid consent creates CPD record", () => {
  let userId: string;
  let createdId: string;

  beforeAll(async () => {
    userId = await mkUser("ConsentedUser");
    await grantConsent(userId, true);
  });

  it("returns 201 with pending status", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await cpdPOST(postReq(validCpdBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("pending");
    expect(json.hoursLogged).toBe(4);
    createdId = json.id;
    cleanup.cpdRecordIds.push(createdId);
  });

  it("CPD record is in DB with correct fields", async () => {
    const rec = await db.cPDRecord.findUnique({ where: { id: createdId } });
    expect(rec?.title).toBe("ISO 9001 Conference");
    expect(rec?.type).toBe("conference");
    expect(rec?.userId).toBe(userId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// d. GET — returns own records
// ─────────────────────────────────────────────────────────────────────────────
describe("d. GET /api/cpd — returns own records only", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await mkUser("GetCpdUser");
    await grantConsent(userId, true);
    const rec = await db.cPDRecord.create({
      data: { userId, title: "Own CPD", type: "self_study", hoursLogged: 2, activityDate: new Date(), status: "pending" },
    });
    cleanup.cpdRecordIds.push(rec.id);
  });

  it("returns only the authenticated user's records", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await cpdGET();
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.every((r: { userId: string }) => r.userId === userId)).toBe(true);
    expect(json.some((r: { title: string }) => r.title === "Own CPD")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// e. GET /api/cpd/[id] — own record
// ─────────────────────────────────────────────────────────────────────────────
describe("e. GET /api/cpd/[id] — own record", () => {
  let userId: string;
  let recordId: string;

  beforeAll(async () => {
    userId = await mkUser("GetIdUser");
    const rec = await db.cPDRecord.create({
      data: { userId, title: "My CPD Record", type: "work_experience", hoursLogged: 8, activityDate: new Date(), status: "pending" },
    });
    recordId = rec.id;
    cleanup.cpdRecordIds.push(recordId);
  });

  it("returns 200 with the record", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await cpdIdGET(
      new NextRequest(`http://localhost/api/cpd/${recordId}`),
      { params: Promise.resolve({ id: recordId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(recordId);
    expect(json.title).toBe("My CPD Record");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// f. GET /api/cpd/[id] — another user's record → 403
// ─────────────────────────────────────────────────────────────────────────────
describe("f. GET /api/cpd/[id] — other user's record forbidden", () => {
  let ownerId: string;
  let otherId: string;
  let recordId: string;

  beforeAll(async () => {
    ownerId = await mkUser("RecordOwner");
    otherId = await mkUser("RecordOther");
    const rec = await db.cPDRecord.create({
      data: { userId: ownerId, title: "Owner's Record", type: "publication", hoursLogged: 1, activityDate: new Date(), status: "pending" },
    });
    recordId = rec.id;
    cleanup.cpdRecordIds.push(recordId);
  });

  it("returns 403 when accessing another user's record", async () => {
    mockAuth.mockResolvedValue(makeSession(otherId) as never);
    const res = await cpdIdGET(
      new NextRequest(`http://localhost/api/cpd/${recordId}`),
      { params: Promise.resolve({ id: recordId }) },
    );
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// g. PATCH — non-admin forbidden
// ─────────────────────────────────────────────────────────────────────────────
describe("g. PATCH — non-admin forbidden", () => {
  let userId: string;
  let recordId: string;

  beforeAll(async () => {
    userId = await mkUser("PatchCandCpd");
    const rec = await db.cPDRecord.create({
      data: { userId, title: "Patch Test Record", type: "conference", hoursLogged: 3, activityDate: new Date(), status: "pending" },
    });
    recordId = rec.id;
    cleanup.cpdRecordIds.push(recordId);
  });

  it("returns 403 for CANDIDATE role", async () => {
    mockAuth.mockResolvedValue(makeSession(userId, "CANDIDATE") as never);
    const res = await cpdIdPATCH(
      new NextRequest(`http://localhost/api/cpd/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: recordId }) },
    );
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// h. PATCH — admin approves
// ─────────────────────────────────────────────────────────────────────────────
describe("h. PATCH — admin approves CPD record", () => {
  let adminId: string;
  let recordId: string;

  beforeAll(async () => {
    adminId = await mkUser("ApproveAdmin", "CERTIFICATION_OFFICER");
    const candidateId = await mkUser("ApproveCand");
    mockAuditLog.mockClear();
    const rec = await db.cPDRecord.create({
      data: { userId: candidateId, title: "Approvable Record", type: "course_completion", hoursLogged: 5, activityDate: new Date(), status: "pending" },
    });
    recordId = rec.id;
    cleanup.cpdRecordIds.push(recordId);
  });

  it("returns 200 with approved status", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId, "CERTIFICATION_OFFICER") as never);
    const res = await cpdIdPATCH(
      new NextRequest(`http://localhost/api/cpd/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "approved", reviewNote: "Well documented activity" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: recordId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("approved");
    expect(json.reviewNote).toBe("Well documented activity");
  });

  it("calls auditLog with CPD_RECORD_REVIEWED", () => {
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CPD_RECORD_REVIEWED" }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// i. PATCH — admin rejects
// ─────────────────────────────────────────────────────────────────────────────
describe("i. PATCH — admin rejects CPD record", () => {
  let adminId: string;
  let recordId: string;

  beforeAll(async () => {
    adminId = await mkUser("RejectAdmin", "SUPER_ADMIN");
    const candidateId = await mkUser("RejectCand");
    const rec = await db.cPDRecord.create({
      data: { userId: candidateId, title: "Rejectable Record", type: "self_study", hoursLogged: 2, activityDate: new Date(), status: "pending" },
    });
    recordId = rec.id;
    cleanup.cpdRecordIds.push(recordId);
  });

  it("returns 200 with rejected status", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId, "SUPER_ADMIN") as never);
    const res = await cpdIdPATCH(
      new NextRequest(`http://localhost/api/cpd/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rejected", reviewNote: "Insufficient evidence provided" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: recordId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("rejected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// j. DELETE — own pending record
// ─────────────────────────────────────────────────────────────────────────────
describe("j. DELETE — own pending record", () => {
  let userId: string;
  let recordId: string;

  beforeAll(async () => {
    userId = await mkUser("DeleteOwner");
    const rec = await db.cPDRecord.create({
      data: { userId, title: "To Delete", type: "conference", hoursLogged: 1, activityDate: new Date(), status: "pending" },
    });
    recordId = rec.id;
    // Don't push to cleanup.cpdRecordIds — it gets deleted in the test
  });

  it("returns 200 and removes the record", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await cpdIdDELETE(
      new NextRequest(`http://localhost/api/cpd/${recordId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: recordId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);

    const gone = await db.cPDRecord.findUnique({ where: { id: recordId } });
    expect(gone).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// k. DELETE — approved record → 409
// ─────────────────────────────────────────────────────────────────────────────
describe("k. DELETE — approved record cannot be deleted by candidate", () => {
  let userId: string;
  let recordId: string;

  beforeAll(async () => {
    userId = await mkUser("DeleteApproved");
    const rec = await db.cPDRecord.create({
      data: { userId, title: "Approved Record", type: "course_completion", hoursLogged: 5, activityDate: new Date(), status: "approved" },
    });
    recordId = rec.id;
    cleanup.cpdRecordIds.push(recordId);
  });

  it("returns 409 for approved record", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await cpdIdDELETE(
      new NextRequest(`http://localhost/api/cpd/${recordId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: recordId }) },
    );
    expect(res.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// l. DELETE — another user's record → 403
// ─────────────────────────────────────────────────────────────────────────────
describe("l. DELETE — another user's record", () => {
  let ownerId: string;
  let otherId: string;
  let recordId: string;

  beforeAll(async () => {
    ownerId = await mkUser("DelOwner");
    otherId = await mkUser("DelOther");
    const rec = await db.cPDRecord.create({
      data: { userId: ownerId, title: "Owner Record", type: "publication", hoursLogged: 2, activityDate: new Date(), status: "pending" },
    });
    recordId = rec.id;
    cleanup.cpdRecordIds.push(recordId);
  });

  it("returns 403", async () => {
    mockAuth.mockResolvedValue(makeSession(otherId) as never);
    const res = await cpdIdDELETE(
      new NextRequest(`http://localhost/api/cpd/${recordId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: recordId }) },
    );
    expect(res.status).toBe(403);
  });
});
