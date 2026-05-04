/**
 * Integration tests — Candidate registration type differentiation
 *
 * Coverage:
 *  a. Individual registration flow
 *  b. Org-sponsored enrolment (ORG_MANAGER assigns)
 *  c. "Never downgrade" rule — ORG_SPONSORED stays ORG_SPONSORED
 *  d. ORG_SELF_ENROL path — org member who self-enrolls
 *  e. CPD logging attribution (SELF vs ORG_MANAGER)
 *  f. Purchase owner integrity + purchases.organisationId index existence
 *
 * ── HOW MOCKS WORK ────────────────────────────────────────────────────────────
 *
 * jest.mock factories are hoisted before any import. The factory for @/lib/db
 * creates ONE real Prisma client (pointed at TEST_DATABASE_URL) and returns it.
 * Jest module caching ensures every import of @/lib/db — including inside the
 * route handlers under test — receives the SAME client instance. So DB writes
 * made by route handlers are immediately visible to test assertions.
 *
 * NextAuth (@/lib/auth) is mocked so individual tests can control which user
 * is "logged in" without spinning up the full Auth.js stack.
 */

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

jest.mock("@/lib/db", () => {
  // require() is fine inside a jest.mock factory — it runs in CommonJS context.
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  require("dotenv").config();
  // Prefer DIRECT_URL: the pooled DATABASE_URL has pgbouncer=true which is
  // incompatible with long-lived Jest process connections.
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

jest.mock("@/lib/email", () => ({
  sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendMemberWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/rate-limit", () => ({
  rateLimit: jest.fn().mockResolvedValue({ success: true, retryAfterSecs: 0 }),
  getClientIp: jest.fn().mockReturnValue("127.0.0.1"),
}));

// Audit logging is best-effort and tested separately; mock to keep tests clean.
jest.mock("@/lib/audit", () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports (resolved after mocks are registered) ─────────────────────────────

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as enrolPOST } from "@/app/api/enrolments/route";
import { POST as orgEnrolPOST } from "@/app/api/organisations/[id]/enrol/route";

// ── Test helpers ──────────────────────────────────────────────────────────────

const mockAuth = auth as jest.MockedFunction<typeof auth>;

/** IDs created during this test run — cleaned up in afterAll. */
const createdIds = {
  userIds: [] as string[],
  orgIds: [] as string[],
  courseIds: [] as string[],
};

function makeSession(userId: string, role = "CANDIDATE") {
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

function jsonRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Build a minimal published course in the test DB. */
async function createTestCourse(title: string): Promise<string> {
  // Trainer user is required by the Course.creatorId FK.
  const trainer = await db.user.create({
    data: {
      email: `trainer-${Date.now()}-${Math.random()}@test.example.com`,
      firstName: "Trainer",
      lastName: "Bot",
      passwordHash: "x",
      role: "TRAINER",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });
  createdIds.userIds.push(trainer.id);

  const scheme = await db.certificationScheme.create({
    data: {
      code: `TEST-${Date.now()}`,
      name: title,
      passMark: 70,
      maxAttempts: 3,
    },
  });

  const course = await db.course.create({
    data: {
      title,
      slug: `test-course-${Date.now()}-${Math.random()}`,
      schemeId: scheme.id,
      creatorId: trainer.id,
      status: "PUBLISHED",
      price: 0,
    },
  });
  createdIds.courseIds.push(course.id);
  return course.id;
}

/** Create a minimal CANDIDATE user directly (bypasses registration route). */
async function createTestUser(suffix: string, role = "CANDIDATE"): Promise<string> {
  const user = await db.user.create({
    data: {
      email: `${suffix}-${Date.now()}@test.example.com`,
      firstName: "Test",
      lastName: suffix,
      passwordHash: "x",
      role,
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });
  createdIds.userIds.push(user.id);
  return user.id;
}

/** Create an org and add a user as ORG_MANAGER. */
async function createTestOrg(managerId: string): Promise<string> {
  const org = await db.organisation.create({
    data: { name: `TestOrg-${Date.now()}`, isActive: true },
  });
  createdIds.orgIds.push(org.id);
  await db.organisationMember.create({
    data: { userId: managerId, organisationId: org.id, role: "ORG_MANAGER" },
  });
  return org.id;
}

// ── Global cleanup ────────────────────────────────────────────────────────────

afterAll(async () => {
  // Delete in FK-safe order (children before parents).
  // Some deletes may be no-ops if a specific test failed early — that's fine.

  // lesson_progress → enrolments
  if (createdIds.courseIds.length) {
    await db.enrolment.deleteMany({
      where: { courseId: { in: createdIds.courseIds } },
    });
  }

  // exam_attempts, certificates, cpd_records, purchases that reference our orgs
  if (createdIds.orgIds.length) {
    await db.cPDRecord.deleteMany({
      where: { organisationId: { in: createdIds.orgIds } },
    });
    await db.purchase.deleteMany({
      where: { organisationId: { in: createdIds.orgIds } },
    });
  }

  // cpd_records, consent_records, candidate_profiles belonging to test users
  if (createdIds.userIds.length) {
    await db.cPDRecord.deleteMany({
      where: { userId: { in: createdIds.userIds } },
    });
    await db.consentRecord.deleteMany({
      where: { userId: { in: createdIds.userIds } },
    });
    await db.verificationToken.deleteMany({
      where: { identifier: { contains: "@test.example.com" } },
    });
    await db.candidateProfile.deleteMany({
      where: { userId: { in: createdIds.userIds } },
    });
    await db.organisationMember.deleteMany({
      where: { userId: { in: createdIds.userIds } },
    });
    await db.auditLog.deleteMany({
      where: { userId: { in: createdIds.userIds } },
    });
    await db.notification.deleteMany({
      where: { userId: { in: createdIds.userIds } },
    });
  }

  // Orgs (after all child tables cleared)
  if (createdIds.orgIds.length) {
    await db.organisation.deleteMany({
      where: { id: { in: createdIds.orgIds } },
    });
  }

  // Courses (scheme is cascade from course? No — clean both)
  if (createdIds.courseIds.length) {
    const courses = await db.course.findMany({
      where: { id: { in: createdIds.courseIds } },
      select: { schemeId: true },
    });
    await db.course.deleteMany({ where: { id: { in: createdIds.courseIds } } });
    const schemeIds = courses.map((c) => c.schemeId).filter(Boolean) as string[];
    if (schemeIds.length) {
      await db.certificationScheme.deleteMany({ where: { id: { in: schemeIds } } });
    }
  }

  // Users (last — most things FK to users)
  if (createdIds.userIds.length) {
    await db.user.deleteMany({ where: { id: { in: createdIds.userIds } } });
  }

  await (db as unknown as { $disconnect(): Promise<void> }).$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// a. INDIVIDUAL REGISTRATION
// ═════════════════════════════════════════════════════════════════════════════

describe("a. Individual registration", () => {
  let userId: string;
  let courseId: string;
  const testEmail = `individual-${Date.now()}@test.example.com`;

  beforeAll(async () => {
    courseId = await createTestCourse("Indiv Course");
  });

  it("POST /api/auth/register creates CandidateProfile with registrationType:INDIVIDUAL", async () => {
    const req = jsonRequest("http://localhost/api/auth/register", {
      firstName: "Dave",
      lastName: "Individual",
      email: testEmail,
      password: "Test@12345678!",
      consentTerms: true,
      accountType: "individual",
    });

    const res = await registerPOST(req);
    expect(res.status).toBe(201);

    const user = await db.user.findUnique({ where: { email: testEmail } });
    expect(user).not.toBeNull();
    userId = user!.id;
    createdIds.userIds.push(userId);

    const profile = await db.candidateProfile.findUnique({ where: { userId } });
    expect(profile).not.toBeNull();
    expect(profile!.registrationType).toBe("INDIVIDUAL");
    expect(profile!.sponsoringOrgId).toBeNull();
  });

  it("POST /api/enrolments sets registrationSource:SELF and organisationId:null", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);

    const req = jsonRequest("http://localhost/api/enrolments", { courseId });
    const res = await enrolPOST(req);
    expect(res.status).toBe(201);

    const enrolment = await db.enrolment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    expect(enrolment).not.toBeNull();
    expect(enrolment!.registrationSource).toBe("SELF");
    expect(enrolment!.organisationId).toBeNull();
  });

  it("individual enrolments do NOT appear in an ORG_MANAGER dashboard query (organisationId filter)", async () => {
    const orgId = "nonexistent-org-id-for-filter-test";

    // Simulate what an ORG_MANAGER dashboard query looks like:
    // WHERE organisationId = :orgId
    const orgEnrolments = await db.enrolment.findMany({
      where: { organisationId: orgId, userId },
    });
    expect(orgEnrolments).toHaveLength(0);

    // Also confirm the enrolment truly has organisationId = null
    const enrolment = await db.enrolment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { organisationId: true },
    });
    expect(enrolment?.organisationId).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// b. ORG-SPONSORED ENROLMENT
// ═════════════════════════════════════════════════════════════════════════════

describe("b. Org-sponsored enrolment", () => {
  let managerId: string;
  let candidateId: string;
  let orgId: string;
  let courseId: string;

  beforeAll(async () => {
    managerId = await createTestUser("OrgMgr", "ORG_MANAGER");
    candidateId = await createTestUser("OrgSponsored");
    orgId = await createTestOrg(managerId);
    courseId = await createTestCourse("Sponsored Course");

    // Add candidate as org member — required by the enrol route's membership check
    await db.organisationMember.create({
      data: { userId: candidateId, organisationId: orgId, role: "CANDIDATE" },
    });
  });

  it("sets registrationType:ORG_SPONSORED and sponsoringOrgId on the candidate's profile", async () => {
    mockAuth.mockResolvedValue(makeSession(managerId, "ORG_MANAGER") as never);

    const req = jsonRequest(`http://localhost/api/organisations/${orgId}/enrol`, {
      courseId,
      userIds: [candidateId],
    });
    const res = await orgEnrolPOST(req, {
      params: Promise.resolve({ id: orgId }),
    });
    expect(res.status).toBe(200);

    const profile = await db.candidateProfile.findUnique({ where: { userId: candidateId } });
    expect(profile).not.toBeNull();
    expect(profile!.registrationType).toBe("ORG_SPONSORED");
    expect(profile!.sponsoringOrgId).toBe(orgId);
  });

  it("stamps organisationId and registrationSource:ORG_ASSIGNED on the Enrolment record", async () => {
    const enrolment = await db.enrolment.findUnique({
      where: { userId_courseId: { userId: candidateId, courseId } },
    });
    expect(enrolment).not.toBeNull();
    expect(enrolment!.organisationId).toBe(orgId);
    expect(enrolment!.registrationSource).toBe("ORG_ASSIGNED");
  });

  it("ORG_MANAGER for that org CAN find this candidate's Enrolment via organisationId filter", async () => {
    const enrolments = await db.enrolment.findMany({
      where: { organisationId: orgId },
      include: { user: { select: { id: true } } },
    });
    const ids = enrolments.map((e) => e.user.id);
    expect(ids).toContain(candidateId);
  });

  it("creates ExamAttempt with organisationId when stamped from the org context (direct DB write test)", async () => {
    // ExamAttempts are created by the exam engine, not the enrolment route.
    // This test verifies the FK works and the field is queryable by ORG_MANAGER.
    // We write directly to simulate what the exam engine would do.
    const paper = await db.examPaper.create({
      data: {
        title: `TestPaper-${Date.now()}`,
        creatorId: managerId,
        isActive: true,
      },
    });

    const attempt = await db.examAttempt.create({
      data: {
        userId: candidateId,
        examPaperId: paper.id,
        organisationId: orgId,
        status: "SCHEDULED",
      },
    });

    const orgAttempts = await db.examAttempt.findMany({
      where: { organisationId: orgId },
    });
    expect(orgAttempts.some((a) => a.id === attempt.id)).toBe(true);

    // Cleanup exam artefacts (not tracked in createdIds)
    await db.examAttempt.delete({ where: { id: attempt.id } });
    await db.examPaper.delete({ where: { id: paper.id } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// c. "NEVER DOWNGRADE" RULE — ORG_SPONSORED stays ORG_SPONSORED
// ═════════════════════════════════════════════════════════════════════════════

describe("c. Never-downgrade rule", () => {
  let managerId: string;
  let candidateId: string;
  let orgId: string;
  let course1Id: string;
  let course2Id: string;

  beforeAll(async () => {
    managerId = await createTestUser("NdMgr", "ORG_MANAGER");
    candidateId = await createTestUser("NdCandidate");
    orgId = await createTestOrg(managerId);
    [course1Id, course2Id] = await Promise.all([
      createTestCourse("ND Course 1"),
      createTestCourse("ND Course 2"),
    ]);

    // Add candidate to org so both sponsored enrolment and self-enrol work
    await db.organisationMember.create({
      data: { userId: candidateId, organisationId: orgId, role: "CANDIDATE" },
    });

    // Step 1: ORG_MANAGER enrols candidate in course 1 → sets ORG_SPONSORED
    mockAuth.mockResolvedValue(makeSession(managerId, "ORG_MANAGER") as never);
    await orgEnrolPOST(
      jsonRequest(`http://localhost/api/organisations/${orgId}/enrol`, {
        courseId: course1Id,
        userIds: [candidateId],
      }),
      { params: Promise.resolve({ id: orgId }) },
    );
  });

  it("profile is ORG_SPONSORED after org enrolment", async () => {
    const profile = await db.candidateProfile.findUnique({ where: { userId: candidateId } });
    expect(profile!.registrationType).toBe("ORG_SPONSORED");
  });

  it("self-enrolling in a second course does NOT downgrade registrationType", async () => {
    // Candidate self-enrolls in course 2
    mockAuth.mockResolvedValue(makeSession(candidateId) as never);
    const req = jsonRequest("http://localhost/api/enrolments", { courseId: course2Id });
    const res = await enrolPOST(req);
    expect(res.status).toBe(201);

    // registrationType must STILL be ORG_SPONSORED
    const profile = await db.candidateProfile.findUnique({ where: { userId: candidateId } });
    expect(profile!.registrationType).toBe("ORG_SPONSORED");
    expect(profile!.sponsoringOrgId).toBe(orgId);
  });

  it("the new self-enrolment gets organisationId from the org membership (not null)", async () => {
    // The candidate IS a member of orgId, so organisationId is stamped even on SELF enrolments.
    const enrolment = await db.enrolment.findUnique({
      where: { userId_courseId: { userId: candidateId, courseId: course2Id } },
    });
    expect(enrolment!.registrationSource).toBe("SELF");
    // organisationId comes from organisationMember.findFirst — same org since user has only one
    expect(enrolment!.organisationId).toBe(orgId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// d. ORG_SELF_ENROL PATH
// ═════════════════════════════════════════════════════════════════════════════

describe("d. ORG_SELF_ENROL path", () => {
  let candidateId: string;
  let orgId: string;
  let courseId: string;

  beforeAll(async () => {
    const managerId = await createTestUser("SelfEnrolMgr", "ORG_MANAGER");
    candidateId = await createTestUser("SelfEnrolCandidate");
    orgId = await createTestOrg(managerId);
    courseId = await createTestCourse("Self Enrol Course");

    // User is an org member but has NOT been sponsored (no org enrolment yet)
    await db.organisationMember.create({
      data: { userId: candidateId, organisationId: orgId, role: "CANDIDATE" },
    });
  });

  it("sets registrationType:ORG_SELF_ENROL when an org member self-enrolls", async () => {
    mockAuth.mockResolvedValue(makeSession(candidateId) as never);
    const res = await enrolPOST(
      jsonRequest("http://localhost/api/enrolments", { courseId }),
    );
    expect(res.status).toBe(201);

    const profile = await db.candidateProfile.findUnique({ where: { userId: candidateId } });
    expect(profile!.registrationType).toBe("ORG_SELF_ENROL");
  });

  it("stamps organisationId from the OrganisationMember record", async () => {
    const enrolment = await db.enrolment.findUnique({
      where: { userId_courseId: { userId: candidateId, courseId } },
    });
    expect(enrolment!.organisationId).toBe(orgId);
    expect(enrolment!.registrationSource).toBe("SELF");
  });

  it("sponsoringOrgId on CandidateProfile matches the org from membership", async () => {
    const profile = await db.candidateProfile.findUnique({ where: { userId: candidateId } });
    expect(profile!.sponsoringOrgId).toBe(orgId);
  });

  describe("multi-org tie-breaking", () => {
    let secondOrgId: string;
    let multiOrgUserId: string;
    let multiCourseId: string;

    beforeAll(async () => {
      const mgr2 = await createTestUser("MultiMgr2", "ORG_MANAGER");
      multiOrgUserId = await createTestUser("MultiOrgCandidate");
      secondOrgId = await createTestOrg(mgr2);
      multiCourseId = await createTestCourse("Multi Org Course");

      // Add to BOTH orgs
      await db.organisationMember.create({
        data: { userId: multiOrgUserId, organisationId: orgId, role: "CANDIDATE" },
      });
      await db.organisationMember.create({
        data: { userId: multiOrgUserId, organisationId: secondOrgId, role: "CANDIDATE" },
      });
    });

    it("tie-breaking rule: organisationId is taken from findFirst (heap order, not deterministic)", async () => {
      // DOCUMENTED LIMITATION: when a candidate belongs to multiple organisations,
      // POST /api/enrolments picks whichever org is returned first by
      // db.organisationMember.findFirst (no ORDER BY). This is the earliest-inserted
      // membership row by heap order — not guaranteed across vacuum/cluster operations.
      // FIX: add `orderBy: { joinedAt: "asc" }` in the route to make it deterministic.
      mockAuth.mockResolvedValue(makeSession(multiOrgUserId) as never);
      const res = await enrolPOST(
        jsonRequest("http://localhost/api/enrolments", { courseId: multiCourseId }),
      );
      expect(res.status).toBe(201);

      const enrolment = await db.enrolment.findUnique({
        where: { userId_courseId: { userId: multiOrgUserId, courseId: multiCourseId } },
      });
      // Either org is "valid" — test documents whichever one was chosen
      expect([orgId, secondOrgId]).toContain(enrolment!.organisationId);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// e. CPD LOGGING ATTRIBUTION
// ═════════════════════════════════════════════════════════════════════════════

describe("e. CPD logging attribution", () => {
  let managerId: string;
  let candidateId: string;
  let individualId: string;
  let orgId: string;

  beforeAll(async () => {
    managerId = await createTestUser("CpdMgr", "ORG_MANAGER");
    candidateId = await createTestUser("CpdCandidate");
    individualId = await createTestUser("CpdIndividual");
    orgId = await createTestOrg(managerId);
  });

  it("ORG_MANAGER logging CPD for a candidate: loggedByUserId = managerId, loggedBy = ORG_MANAGER", async () => {
    const record = await db.cPDRecord.create({
      data: {
        userId: candidateId,
        title: "ISO 27001 Workshop",
        type: "conference",
        hoursLogged: 8,
        activityDate: new Date("2026-01-15"),
        organisationId: orgId,
        loggedBy: "ORG_MANAGER",
        loggedByUserId: managerId,
      },
    });

    expect(record.loggedBy).toBe("ORG_MANAGER");
    expect(record.loggedByUserId).toBe(managerId);
    expect(record.organisationId).toBe(orgId);

    // ORG_MANAGER dashboard query can see this record
    const orgRecords = await db.cPDRecord.findMany({
      where: { organisationId: orgId },
    });
    expect(orgRecords.some((r) => r.id === record.id)).toBe(true);

    // Also readable via the loggedByUser relation
    const recordWithRelation = await db.cPDRecord.findUnique({
      where: { id: record.id },
      include: { loggedByUser: { select: { id: true, role: true } } },
    });
    expect(recordWithRelation!.loggedByUser!.id).toBe(managerId);
    expect(recordWithRelation!.loggedByUser!.role).toBe("ORG_MANAGER");
  });

  it("INDIVIDUAL logging own CPD: loggedByUserId = their own userId, loggedBy = SELF", async () => {
    const record = await db.cPDRecord.create({
      data: {
        userId: individualId,
        title: "Self-study: GDPR deep dive",
        type: "self_study",
        hoursLogged: 4,
        activityDate: new Date("2026-02-01"),
        loggedBy: "SELF",
        loggedByUserId: individualId,
      },
    });

    expect(record.loggedBy).toBe("SELF");
    expect(record.loggedByUserId).toBe(individualId);
    expect(record.organisationId).toBeNull();
  });

  it("FK cascade on loggedByUserId: deleting the logging user sets logged_by_user_id to NULL (SET NULL)", async () => {
    // Create a transient "logger" user that we will delete
    const logger = await db.user.create({
      data: {
        email: `logger-todelete-${Date.now()}@test.example.com`,
        firstName: "Logger",
        lastName: "ToDelete",
        passwordHash: "x",
        role: "ORG_MANAGER",
        status: "ACTIVE",
        emailVerified: new Date(),
      },
    });

    const record = await db.cPDRecord.create({
      data: {
        userId: candidateId,
        title: "Logged by soon-deleted user",
        type: "work_experience",
        hoursLogged: 2,
        activityDate: new Date(),
        loggedBy: "ORG_MANAGER",
        loggedByUserId: logger.id,
      },
    });

    // Delete the logger — FK is ON DELETE SET NULL, so loggedByUserId becomes null
    await db.user.delete({ where: { id: logger.id } });

    const refreshed = await db.cPDRecord.findUnique({ where: { id: record.id } });
    // SET NULL: the record survives, loggedByUserId is null
    expect(refreshed).not.toBeNull();
    expect(refreshed!.loggedByUserId).toBeNull();

    // Cleanup
    await db.cPDRecord.delete({ where: { id: record.id } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// f. PURCHASE INTEGRITY
// ═════════════════════════════════════════════════════════════════════════════

describe("f. Purchase integrity", () => {
  let orgId: string;
  let managerId: string;

  beforeAll(async () => {
    managerId = await createTestUser("PurchaseMgr", "ORG_MANAGER");
    orgId = await createTestOrg(managerId);
  });

  it("rejects a purchase with both userId:null AND organisationId:null (CHECK constraint)", async () => {
    // Migration 20260422000007_purchase_owner_check added:
    //   CHECK ("userId" IS NOT NULL OR "organisationId" IS NOT NULL)
    // A purchase with no owner is now a DB-level error.
    await expect(
      db.purchase.create({
        data: { amount: 100, currency: "NGN", status: "PENDING" },
        // userId: null (default), organisationId: null (default)
      }),
    ).rejects.toThrow();
  });

  it("purchases.organisationId index exists in PostgreSQL pg_indexes", async () => {
    // The migration created an index on purchases("organisationId") (camelCase column).
    // This test confirms the index is present in the DB, which is a prerequisite
    // for the EXPLAIN ANALYZE to show an Index Scan instead of a Seq Scan.
    const rows = await db.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'purchases'
        AND indexname = 'purchases_organisation_id_idx'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].indexname).toBe("purchases_organisation_id_idx");
  });

  it("the purchases.organisationId column is stored as camelCase in the DB (no @map on that field)", async () => {
    // The Purchase model has `organisationId String?` without @map, so PostgreSQL
    // stores the column exactly as written in the CREATE TABLE statement: "organisationId".
    // This is distinct from e.g. enrolments."organisation_id" which HAS @map.
    const cols = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'purchases'
        AND column_name ILIKE '%org%'
    `;
    expect(cols).toHaveLength(1);
    // Must be camelCase, NOT snake_case
    expect(cols[0].column_name).toBe("organisationId");
  });

  it("org purchase is findable via organisationId filter (index correctness end-to-end)", async () => {
    const purchase = await db.purchase.create({
      data: { organisationId: orgId, amount: 500, currency: "NGN", status: "PAID" },
    });

    const found = await db.purchase.findMany({
      where: { organisationId: orgId },
    });
    expect(found.some((p) => p.id === purchase.id)).toBe(true);

    await db.purchase.delete({ where: { id: purchase.id } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SCHEMA AUDIT (section 2) — assertions that verify schema integrity
// ═════════════════════════════════════════════════════════════════════════════

describe("Schema audit", () => {
  it("cpd_records.logged_by_user_id FK exists and references users(id)", async () => {
    const fk = await db.$queryRaw<Array<{ constraint_name: string; delete_rule: string }>>`
      SELECT tc.constraint_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'cpd_records'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.constraint_name LIKE '%logged_by_user_id%'
    `;
    expect(fk.length).toBeGreaterThanOrEqual(1);
    expect(fk[0].delete_rule).toBe("SET NULL");
  });

  it("enrolments.organisation_id uses snake_case (has @map('organisation_id'))", async () => {
    const cols = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'enrolments' AND column_name = 'organisation_id'
    `;
    expect(cols).toHaveLength(1);
  });

  it("candidate_profiles.registration_type column exists with correct default", async () => {
    const col = await db.$queryRaw<Array<{ column_default: string }>>`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_name = 'candidate_profiles'
        AND column_name = 'registration_type'
    `;
    expect(col).toHaveLength(1);
    expect(col[0].column_default).toContain("INDIVIDUAL");
  });

  it("CHECK constraint on candidate_profiles.registration_type exists", async () => {
    const checks = await db.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'candidate_profiles'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%registration_type%'
    `;
    expect(checks.length).toBeGreaterThanOrEqual(1);
  });

  it("CHECK constraint on enrolments.registration_source exists", async () => {
    const checks = await db.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'enrolments'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%registration_source%'
    `;
    expect(checks.length).toBeGreaterThanOrEqual(1);
  });

  it("RLS policy 'org_isolation' exists on all six protected tables", async () => {
    const policies = await db.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_policies
      WHERE policyname = 'org_isolation'
      ORDER BY tablename
    `;
    const tables = policies.map((p) => p.tablename);
    expect(tables).toContain("enrolments");
    expect(tables).toContain("exam_attempts");
    expect(tables).toContain("certificates");
    expect(tables).toContain("cpd_records");
    expect(tables).toContain("organisation_members");
    expect(tables).toContain("departments");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// g. ROW-LEVEL SECURITY ISOLATION
// ═════════════════════════════════════════════════════════════════════════════

describe("g. RLS isolation", () => {
  let org1Id: string;
  let org2Id: string;
  let candidate1Id: string;
  let candidate2Id: string;
  let courseId: string;

  beforeAll(async () => {
    const mgr1 = await createTestUser("RlsMgr1", "ORG_MANAGER");
    const mgr2 = await createTestUser("RlsMgr2", "ORG_MANAGER");
    candidate1Id = await createTestUser("RlsCandidate1");
    candidate2Id = await createTestUser("RlsCandidate2");
    org1Id = await createTestOrg(mgr1);
    org2Id = await createTestOrg(mgr2);
    courseId = await createTestCourse("RLS Test Course");

    // Enrol candidate1 in org1, candidate2 in org2
    await db.enrolment.create({
      data: {
        userId: candidate1Id,
        courseId,
        status: "ACTIVE",
        organisationId: org1Id,
        registrationSource: "ORG_ASSIGNED",
      },
    });
    await db.enrolment.create({
      data: {
        userId: candidate2Id,
        courseId: courseId + "-unused", // different course to avoid unique constraint
        status: "ACTIVE",
        organisationId: org2Id,
        registrationSource: "ORG_ASSIGNED",
      },
    }).catch(async () => {
      // courseId+"-unused" doesn't exist — create a second course instead
      const course2Id = await createTestCourse("RLS Test Course 2");
      await db.enrolment.create({
        data: {
          userId: candidate2Id,
          courseId: course2Id,
          status: "ACTIVE",
          organisationId: org2Id,
          registrationSource: "ORG_ASSIGNED",
        },
      });
    });
  });

  it("without org context, all enrolments are visible (admin/migration mode)", async () => {
    // No set_config call → current_setting returns '' → RLS allows all rows
    const org1Enrolments = await db.enrolment.findMany({ where: { organisationId: org1Id } });
    const org2Enrolments = await db.enrolment.findMany({ where: { organisationId: org2Id } });
    expect(org1Enrolments.length).toBeGreaterThanOrEqual(1);
    expect(org2Enrolments.length).toBeGreaterThanOrEqual(1);
  });

  it("with org1 context set, org2 enrolments are invisible even without a WHERE clause", async () => {
    // TWO steps are required for RLS to engage:
    //   1. Switch role to neondb_app (rolbypassrls=false) — without this,
    //      neondb_owner's BYPASSRLS attribute skips all policies regardless.
    //   2. Set app.current_org_id — the policy reads this to filter rows.
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('role', 'neondb_app', true)`;
      await tx.$queryRaw`SELECT set_config('app.current_org_id', ${org1Id}, true)`;

      // No WHERE on organisationId — RLS enforces the filter automatically
      const visible = await tx.enrolment.findMany({
        where: { userId: candidate2Id }, // candidate2 belongs to org2, not org1
      });

      expect(visible).toHaveLength(0);
    });
  });

  it("with org1 context set, org1 enrolments are still visible", async () => {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.current_org_id', ${org1Id}, true)`;

      const visible = await tx.enrolment.findMany({
        where: { userId: candidate1Id },
      });

      expect(visible.length).toBeGreaterThanOrEqual(1);
      expect(visible.every((e) => e.organisationId === org1Id)).toBe(true);
    });
  });

  it("RLS context resets after the transaction ends — next query sees all rows again", async () => {
    // Set context inside a transaction
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.current_org_id', ${org1Id}, true)`;
    });

    // Outside the transaction: setting has reset (is_local=true) — full visibility restored
    const org2Enrolments = await db.enrolment.findMany({ where: { organisationId: org2Id } });
    expect(org2Enrolments.length).toBeGreaterThanOrEqual(1);
  });

  it("withOrgContext() utility enforces isolation via the same mechanism", async () => {
    // Import here to use the same mocked db instance
    const { withOrgContext } = await import("@/lib/rls");

    const visibleToOrg1 = await withOrgContext(db, org1Id, async (tx) => {
      return tx.enrolment.findMany({ where: { userId: candidate2Id } });
    });

    // candidate2 is in org2 — invisible when org1 context is active
    expect(visibleToOrg1).toHaveLength(0);
  });
});
