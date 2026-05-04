/**
 * Integration tests — GDPR Breach Incidents
 *
 * Coverage:
 *  a. POST — unauthorized → 401
 *  b. POST — candidate forbidden → 403
 *  c. POST — invalid body → 400
 *  d. POST — happy path → 201 with dpaDeadline ~72h from now
 *  e. GET  — unauthorized → 401, forbidden → 403
 *  f. GET  — admin sees paginated breach list with dpaWindowExpired annotation
 *  g. PATCH — unauthorized → 401, forbidden → 403
 *  h. PATCH — breach not found → 404
 *  i. PATCH — empty body → 400
 *  j. PATCH — mark reportedToAuthority=true sets authorityReportedAt
 *  k. PATCH — mark candidatesNotified=true sets candidatesNotifiedAt
 *  l. PATCH — status transitions (open→investigating→resolved) set resolvedAt
 *  m. breachDpaReminder Inngest function — skips when already reported
 *  n. breachDpaReminder Inngest function — sends notifications when not reported
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
jest.mock("@/inngest/client", () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
    createFunction: jest.fn().mockImplementation(
      (_config: unknown, handler: unknown) => ({ handler }),
    ),
  },
  EVENTS: { BREACH_REPORTED: "breach/reported" },
}));
jest.mock("@/lib/email", () => ({
  sendBreachReminderEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { GET as breachGET, POST as breachPOST } from "@/app/api/gdpr/breach/route";
import { PATCH as breachPATCH } from "@/app/api/gdpr/breach/[id]/route";
import { breachDpaReminder } from "@/inngest/functions/breachReminder";
import { sendBreachReminderEmail } from "@/lib/email";
import { addHours } from "date-fns";

const mockAuth = auth as jest.MockedFunction<typeof auth>;

const cleanup = { userIds: [] as string[], breachIds: [] as string[] };

function makeSession(userId: string, role = "SUPER_ADMIN") {
  return {
    user: {
      id: userId,
      email: `${userId}@breach.test`,
      name: "Test",
      role,
      mfaEnabled: false,
      mfaVerified: true,
      mustChangePassword: false,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

async function mkUser(tag: string, role = "SUPER_ADMIN") {
  const u = await db.user.create({
    data: {
      email: `${tag.toLowerCase().replace(/\s/g, "-")}-${Date.now()}@breach.test`,
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
  return new NextRequest("http://localhost/api/gdpr/breach", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function patchReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/gdpr/breach/test", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_BREACH = {
  title: "Unauthorised data export",
  description: "A contractor exported personal data without authorisation during a system migration.",
  severity: "high",
  affectedUsers: 150,
  dataTypesAffected: "names, email addresses, assessment scores",
};

afterAll(async () => {
  await db.breachIncident.deleteMany({ where: { id: { in: cleanup.breachIds } } });
  await db.auditLog.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.notification.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// a. POST — unauthorized
// ─────────────────────────────────────────────────────────────────────────────
describe("a. POST — unauthorized returns 401", () => {
  it("returns 401 with no session", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await breachPOST(postReq(VALID_BREACH));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// b. POST — candidate forbidden
// ─────────────────────────────────────────────────────────────────────────────
describe("b. POST — candidate role is forbidden", () => {
  let candidateId: string;
  beforeAll(async () => { candidateId = await mkUser("BreachCand", "CANDIDATE"); });

  it("returns 403 for CANDIDATE role", async () => {
    mockAuth.mockResolvedValue(makeSession(candidateId, "CANDIDATE") as never);
    const res = await breachPOST(postReq(VALID_BREACH));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// c. POST — invalid body
// ─────────────────────────────────────────────────────────────────────────────
describe("c. POST — invalid body returns 400", () => {
  let adminId: string;
  beforeAll(async () => { adminId = await mkUser("BreachBadAdmin"); });

  it("returns 400 when title too short", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const res = await breachPOST(postReq({ ...VALID_BREACH, title: "oops" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown severity", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const res = await breachPOST(postReq({ ...VALID_BREACH, severity: "extreme" }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// d. POST — happy path
// ─────────────────────────────────────────────────────────────────────────────
describe("d. POST — happy path creates breach with 72h dpaDeadline", () => {
  let adminId: string;
  let createdBreachId: string;

  beforeAll(async () => { adminId = await mkUser("BreachHappyAdmin"); });

  it("returns 201 with breach and dpaDeadline", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const before = Date.now();
    const res = await breachPOST(postReq(VALID_BREACH));
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.breach).toBeDefined();
    expect(json.breach.status).toBe("open");
    expect(json.breach.reportedToAuthority).toBe(false);
    expect(json.dpaDeadline).toBeDefined();

    const deadline = new Date(json.dpaDeadline).getTime();
    const hoursFromNow = (deadline - before) / 3_600_000;
    expect(hoursFromNow).toBeGreaterThan(71);
    expect(hoursFromNow).toBeLessThan(73);

    createdBreachId = json.breach.id;
    cleanup.breachIds.push(createdBreachId);
  });

  it("breach exists in database with correct fields", async () => {
    const breach = await db.breachIncident.findUnique({ where: { id: createdBreachId } });
    expect(breach).not.toBeNull();
    expect(breach!.title).toBe(VALID_BREACH.title);
    expect(breach!.severity).toBe("high");
    expect(breach!.affectedUsers).toBe(150);
    expect(breach!.createdBy).toBe(adminId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// e. GET — auth checks
// ─────────────────────────────────────────────────────────────────────────────
describe("e. GET — auth and role checks", () => {
  let candidateId: string;
  beforeAll(async () => { candidateId = await mkUser("BreachGetCand", "CANDIDATE"); });

  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await breachGET(new NextRequest("http://localhost/api/gdpr/breach"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for CANDIDATE role", async () => {
    mockAuth.mockResolvedValue(makeSession(candidateId, "CANDIDATE") as never);
    const res = await breachGET(new NextRequest("http://localhost/api/gdpr/breach"));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// f. GET — paginated list with dpaWindowExpired annotation
// ─────────────────────────────────────────────────────────────────────────────
describe("f. GET — returns paginated breach list", () => {
  let adminId: string;
  let breachId: string;

  beforeAll(async () => {
    adminId = await mkUser("BreachListAdmin");
    const breach = await db.breachIncident.create({
      data: {
        title: "List test breach incident",
        description: "Created for pagination test",
        severity: "low",
        status: "open",
        createdBy: adminId,
      },
    });
    breachId = breach.id;
    cleanup.breachIds.push(breachId);
  });

  it("returns breaches array with nextCursor", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const res = await breachGET(new NextRequest("http://localhost/api/gdpr/breach"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.breaches)).toBe(true);
    expect("nextCursor" in json).toBe(true);
  });

  it("each breach has dpaDeadline and dpaWindowExpired annotation", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const res = await breachGET(new NextRequest("http://localhost/api/gdpr/breach"));
    const json = await res.json();
    const found = json.breaches.find((b: { id: string }) => b.id === breachId);
    expect(found).toBeDefined();
    expect(found.dpaDeadline).toBeDefined();
    expect(typeof found.dpaWindowExpired).toBe("boolean");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// g. PATCH — auth checks
// ─────────────────────────────────────────────────────────────────────────────
describe("g. PATCH — auth and role checks", () => {
  let candidateId: string;
  let breachId: string;

  beforeAll(async () => {
    candidateId = await mkUser("BreachPatchCand", "CANDIDATE");
    const breach = await db.breachIncident.create({
      data: {
        title: "PATCH auth test breach",
        description: "This breach is used for PATCH auth checks",
        severity: "medium",
        status: "open",
      },
    });
    breachId = breach.id;
    cleanup.breachIds.push(breachId);
  });

  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await breachPATCH(patchReq({ status: "investigating" }), {
      params: Promise.resolve({ id: breachId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for CANDIDATE", async () => {
    mockAuth.mockResolvedValue(makeSession(candidateId, "CANDIDATE") as never);
    const res = await breachPATCH(patchReq({ status: "investigating" }), {
      params: Promise.resolve({ id: breachId }),
    });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// h. PATCH — not found
// ─────────────────────────────────────────────────────────────────────────────
describe("h. PATCH — non-existent breach returns 404", () => {
  let adminId: string;
  beforeAll(async () => { adminId = await mkUser("BreachNotFoundAdmin"); });

  it("returns 404 for unknown id", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const res = await breachPATCH(patchReq({ status: "investigating" }), {
      params: Promise.resolve({ id: "clxxxxxxxxxxxxxxxxxxxxxx" }),
    });
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// i. PATCH — empty body
// ─────────────────────────────────────────────────────────────────────────────
describe("i. PATCH — empty body returns 400", () => {
  let adminId: string;
  let breachId: string;

  beforeAll(async () => {
    adminId = await mkUser("BreachEmptyAdmin");
    const breach = await db.breachIncident.create({
      data: {
        title: "Empty PATCH test breach incident",
        description: "Used for empty body validation test",
        severity: "low",
        status: "open",
      },
    });
    breachId = breach.id;
    cleanup.breachIds.push(breachId);
  });

  it("returns 400 when body has no recognised fields", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const res = await breachPATCH(patchReq({}), {
      params: Promise.resolve({ id: breachId }),
    });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// j. PATCH — reportedToAuthority sets authorityReportedAt
// ─────────────────────────────────────────────────────────────────────────────
describe("j. PATCH — reportedToAuthority=true sets authorityReportedAt", () => {
  let adminId: string;
  let breachId: string;

  beforeAll(async () => {
    adminId = await mkUser("BreachReportedAdmin");
    const breach = await db.breachIncident.create({
      data: {
        title: "Reported to authority test breach",
        description: "This breach tests the reportedToAuthority field update",
        severity: "critical",
        status: "open",
      },
    });
    breachId = breach.id;
    cleanup.breachIds.push(breachId);
  });

  it("returns 200 and sets reportedToAuthority + authorityReportedAt", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const res = await breachPATCH(patchReq({ reportedToAuthority: true }), {
      params: Promise.resolve({ id: breachId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reportedToAuthority).toBe(true);
    expect(json.authorityReportedAt).not.toBeNull();
  });

  it("subsequent PATCH with reportedToAuthority=true is idempotent (no overwrite)", async () => {
    const first = await db.breachIncident.findUnique({ where: { id: breachId } });
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    await breachPATCH(patchReq({ reportedToAuthority: true }), {
      params: Promise.resolve({ id: breachId }),
    });
    const second = await db.breachIncident.findUnique({ where: { id: breachId } });
    // authorityReportedAt should not change on second PATCH (guard in route)
    expect(second!.authorityReportedAt?.toISOString()).toBe(first!.authorityReportedAt?.toISOString());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// k. PATCH — candidatesNotified sets candidatesNotifiedAt
// ─────────────────────────────────────────────────────────────────────────────
describe("k. PATCH — candidatesNotified=true sets candidatesNotifiedAt", () => {
  let adminId: string;
  let breachId: string;

  beforeAll(async () => {
    adminId = await mkUser("BreachCandNotifAdmin");
    const breach = await db.breachIncident.create({
      data: {
        title: "Candidates notified test breach",
        description: "Tests that candidatesNotified flag is updated correctly",
        severity: "medium",
        status: "investigating",
      },
    });
    breachId = breach.id;
    cleanup.breachIds.push(breachId);
  });

  it("sets candidatesNotified=true and candidatesNotifiedAt", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const res = await breachPATCH(patchReq({ candidatesNotified: true }), {
      params: Promise.resolve({ id: breachId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.candidatesNotified).toBe(true);
    expect(json.candidatesNotifiedAt).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// l. PATCH — status transitions
// ─────────────────────────────────────────────────────────────────────────────
describe("l. PATCH — status transitions set resolvedAt on resolved", () => {
  let adminId: string;
  let breachId: string;

  beforeAll(async () => {
    adminId = await mkUser("BreachStatusAdmin");
    const breach = await db.breachIncident.create({
      data: {
        title: "Status transition test breach incident",
        description: "Tests open → investigating → resolved transitions",
        severity: "low",
        status: "open",
      },
    });
    breachId = breach.id;
    cleanup.breachIds.push(breachId);
  });

  it("open → investigating succeeds", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const res = await breachPATCH(patchReq({ status: "investigating" }), {
      params: Promise.resolve({ id: breachId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("investigating");
    expect(json.resolvedAt).toBeNull();
  });

  it("investigating → resolved sets resolvedAt", async () => {
    mockAuth.mockResolvedValue(makeSession(adminId) as never);
    const res = await breachPATCH(patchReq({ status: "resolved" }), {
      params: Promise.resolve({ id: breachId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("resolved");
    expect(json.resolvedAt).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// m. breachDpaReminder Inngest fn — skips when already reported
// ─────────────────────────────────────────────────────────────────────────────
describe("m. breachDpaReminder — exits cleanly when already reported", () => {
  let adminId: string;
  let breachId: string;

  beforeAll(async () => {
    adminId = await mkUser("ReminderSkipAdmin");
    const breach = await db.breachIncident.create({
      data: {
        title: "Already reported breach for reminder test",
        description: "This breach has already been reported to the DPA authority",
        severity: "low",
        status: "open",
        reportedToAuthority: true,
        authorityReportedAt: new Date(),
      },
    });
    breachId = breach.id;
    cleanup.breachIds.push(breachId);
  });

  it("returns { skipped: true, reason: 'already_reported' }", async () => {
    const mockStep = {
      sleepUntil: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockImplementation(async (_id: string, fn: () => Promise<unknown>) => fn()),
    };

    const handler = (breachDpaReminder as unknown as {
      handler: (ctx: { event: { data: { breachId: string; discoveredAt: string } }; step: typeof mockStep }) => Promise<unknown>;
    }).handler;

    const result = await handler({
      event: { data: { breachId, discoveredAt: new Date().toISOString() } },
      step: mockStep,
    });

    expect(result).toEqual({ skipped: true, reason: "already_reported" });
    expect(sendBreachReminderEmail).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// n. breachDpaReminder Inngest fn — sends notifications when not reported
// ─────────────────────────────────────────────────────────────────────────────
describe("n. breachDpaReminder — sends in-app alerts when not reported", () => {
  let adminId: string;
  let breachId: string;

  beforeAll(async () => {
    adminId = await mkUser("ReminderSendAdmin");
    const breach = await db.breachIncident.create({
      data: {
        title: "Unreported breach for reminder send test",
        description: "This breach has NOT been reported to the DPA and needs reminders",
        severity: "high",
        status: "open",
        reportedToAuthority: false,
        discoveredAt: addHours(new Date(), -49), // 49 hours ago — past the 48h reminder mark
      },
    });
    breachId = breach.id;
    cleanup.breachIds.push(breachId);
  });

  afterEach(() => {
    (sendBreachReminderEmail as jest.MockedFunction<typeof sendBreachReminderEmail>).mockClear();
  });

  it("returns { ok: true } and calls sendBreachReminderEmail for admins", async () => {
    const mockStep = {
      sleepUntil: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockImplementation(async (_id: string, fn: () => Promise<unknown>) => fn()),
    };

    const handler = (breachDpaReminder as unknown as {
      handler: (ctx: { event: { data: { breachId: string; discoveredAt: string } }; step: typeof mockStep }) => Promise<unknown>;
    }).handler;

    const result = await handler({
      event: {
        data: {
          breachId,
          discoveredAt: addHours(new Date(), -49).toISOString(),
        },
      },
      step: mockStep,
    });

    expect(result).toMatchObject({ ok: true, breachId });
    // sendBreachReminderEmail called at least once (for the admin created above)
    expect(sendBreachReminderEmail).toHaveBeenCalled();

    const callArgs = (sendBreachReminderEmail as jest.MockedFunction<typeof sendBreachReminderEmail>).mock.calls[0][0];
    expect(callArgs.breachTitle).toBe("Unreported breach for reminder send test");
    expect(callArgs.severity).toBe("high");
    expect(callArgs.dpaDeadline).toBeInstanceOf(Date);
  });

  it("creates SYSTEM_ALERT in-app notification for the admin", async () => {
    // The run above would have created notifications — verify via DB
    const notifications = await db.notification.findMany({
      where: { userId: adminId, type: "SYSTEM_ALERT" },
    });
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].title).toMatch(/ART\. 33 REMINDER/i);
  });
});
