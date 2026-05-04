/**
 * Integration tests — Paystack webhook payment verification
 *
 * Coverage:
 *  a. Signature verification (missing / wrong / tampered body)
 *  b. Non-charge.success events — 200 passthrough, no side effects
 *  c. Amount mismatch — purchase stays PENDING, no enrolment created
 *  d. Happy path — purchase PAID, enrolment ACTIVE
 *  e. Idempotency — duplicate delivery, no duplicate enrolment
 */

// Set env before any imports — verifySignature() reads it at call time
process.env.PAYSTACK_SECRET_KEY = "test-paystack-secret-key-abc123";

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

jest.mock("@/lib/audit", () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

// Prevent real Inngest calls when enrolment confirmation email is dispatched
jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
  EVENTS: { SEND_ENROLMENT_CONFIRM: "email/send-enrolment-confirm" },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import crypto from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { POST } from "@/app/api/payments/paystack/webhook/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-paystack-secret-key-abc123";

const createdIds = {
  userIds: [] as string[],
  courseIds: [] as string[],
  schemeIds: [] as string[],
  purchaseIds: [] as string[],
};

function signPayload(body: string): string {
  return crypto.createHmac("sha512", TEST_SECRET).update(body).digest("hex");
}

function webhookReq(body: string, sig: string): NextRequest {
  return new NextRequest("http://localhost/api/payments/paystack/webhook", {
    method: "POST",
    body,
    headers: { "x-paystack-signature": sig },
  });
}

function chargeSuccessBody(reference: string, amountKobo: number): string {
  return JSON.stringify({
    event: "charge.success",
    data: {
      status: "success",
      reference,
      amount: amountKobo,
      currency: "NGN",
      paid_at: new Date().toISOString(),
      customer: { email: "buyer@test.example.com" },
      metadata: {},
    },
  });
}

async function mkUser(label: string, role = "CANDIDATE"): Promise<string> {
  const user = await db.user.create({
    data: {
      email: `wh-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.example.com`,
      firstName: "Webhook",
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

async function mkCourse(): Promise<{ courseId: string }> {
  const trainerId = await mkUser(`Trainer-${Math.random().toString(36).slice(2)}`, "TRAINER");
  const scheme = await db.certificationScheme.create({
    data: {
      code: `WH-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: "Webhook Test Scheme",
    },
  });
  createdIds.schemeIds.push(scheme.id);
  const course = await db.course.create({
    data: {
      title: "Webhook Test Course",
      slug: `wh-course-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      schemeId: scheme.id,
      creatorId: trainerId,
      status: "PUBLISHED",
      price: 5000,
    },
  });
  createdIds.courseIds.push(course.id);
  return { courseId: course.id };
}

async function mkPurchase(
  userId: string,
  courseId: string,
  amountNgn: number,
  ref: string,
): Promise<string> {
  const p = await db.purchase.create({
    data: { userId, courseId, amount: amountNgn, currency: "NGN", status: "PENDING", paystackReference: ref },
  });
  createdIds.purchaseIds.push(p.id);
  return p.id;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (createdIds.userIds.length) {
    await db.enrolment.deleteMany({ where: { userId: { in: createdIds.userIds } } });
    await db.notification.deleteMany({ where: { userId: { in: createdIds.userIds } } });
    await db.auditLog.deleteMany({ where: { userId: { in: createdIds.userIds } } });
  }
  if (createdIds.purchaseIds.length) {
    await db.purchase.deleteMany({ where: { id: { in: createdIds.purchaseIds } } });
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
// a. Signature verification
// ═════════════════════════════════════════════════════════════════════════════

describe("a. Signature verification", () => {
  it("returns 401 when x-paystack-signature header is absent", async () => {
    const body = chargeSuccessBody("sig-missing", 500_000);
    const req = new NextRequest("http://localhost/api/payments/paystack/webhook", {
      method: "POST",
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when signature is incorrect", async () => {
    const body = chargeSuccessBody("sig-wrong", 500_000);
    const res = await POST(webhookReq(body, "deadbeefdeadbeef"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when body is tampered after signing", async () => {
    const body = chargeSuccessBody("sig-tampered", 500_000);
    const sig = signPayload(body);
    const tampered = body.replace('"amount":500000', '"amount":1');
    const res = await POST(webhookReq(tampered, sig));
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// b. Non-charge.success events
// ═════════════════════════════════════════════════════════════════════════════

describe("b. Non-charge.success events", () => {
  it("returns 200 for charge.failed without side effects", async () => {
    const body = JSON.stringify({ event: "charge.failed", data: { reference: "failed-ref" } });
    const res = await POST(webhookReq(body, signPayload(body)));
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
  });

  it("returns 200 for transfer.success without side effects", async () => {
    const body = JSON.stringify({ event: "transfer.success", data: {} });
    const res = await POST(webhookReq(body, signPayload(body)));
    expect(res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// c. Amount mismatch
// ═════════════════════════════════════════════════════════════════════════════

describe("c. Amount mismatch", () => {
  let userId: string;
  let courseId: string;
  let ref: string;

  beforeAll(async () => {
    userId = await mkUser("AmtBuyer");
    ({ courseId } = await mkCourse());
    ref = `ref-amt-${Date.now()}`;
    await mkPurchase(userId, courseId, 5000, ref); // 5000 NGN → expects 500 000 kobo
  });

  it("returns 200 but leaves purchase PENDING", async () => {
    const body = chargeSuccessBody(ref, 100); // 1 NGN — wrong amount
    const res = await POST(webhookReq(body, signPayload(body)));
    expect(res.status).toBe(200);

    const p = await db.purchase.findFirst({ where: { paystackReference: ref } });
    expect(p?.status).toBe("PENDING");
  });

  it("does not create an enrolment", async () => {
    const e = await db.enrolment.findFirst({ where: { userId, courseId } });
    expect(e).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// d. Happy path
// ═════════════════════════════════════════════════════════════════════════════

describe("d. Happy path — valid charge.success", () => {
  let userId: string;
  let courseId: string;
  let purchaseId: string;
  let ref: string;

  beforeAll(async () => {
    userId = await mkUser("HappyBuyer");
    ({ courseId } = await mkCourse());
    ref = `ref-happy-${Date.now()}`;
    purchaseId = await mkPurchase(userId, courseId, 5000, ref);
  });

  it("marks purchase PAID with paidAt set", async () => {
    const body = chargeSuccessBody(ref, 500_000); // 5000 NGN × 100 kobo
    const res = await POST(webhookReq(body, signPayload(body)));
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);

    const p = await db.purchase.findUnique({ where: { id: purchaseId } });
    expect(p?.status).toBe("PAID");
    expect(p?.paidAt).not.toBeNull();
  });

  it("creates an ACTIVE enrolment linked to the purchase", async () => {
    const enrolment = await db.enrolment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    expect(enrolment).not.toBeNull();
    expect(enrolment?.status).toBe("ACTIVE");
    expect(enrolment?.purchaseId).toBe(purchaseId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// e. Idempotency — duplicate webhook delivery
// ═════════════════════════════════════════════════════════════════════════════

describe("e. Idempotency", () => {
  let userId: string;
  let courseId: string;
  let purchaseId: string;
  let ref: string;

  beforeAll(async () => {
    userId = await mkUser("IdemBuyer");
    ({ courseId } = await mkCourse());
    ref = `ref-idem-${Date.now()}`;
    purchaseId = await mkPurchase(userId, courseId, 5000, ref);

    // First delivery — should mark PAID and create enrolment
    const body = chargeSuccessBody(ref, 500_000);
    await POST(webhookReq(body, signPayload(body)));
  });

  it("second delivery returns 200 without error", async () => {
    const body = chargeSuccessBody(ref, 500_000);
    const res = await POST(webhookReq(body, signPayload(body)));
    expect(res.status).toBe(200);
  });

  it("does not create a duplicate enrolment", async () => {
    const enrolments = await db.enrolment.findMany({ where: { userId, courseId } });
    expect(enrolments).toHaveLength(1);
  });

  it("purchase stays PAID after second delivery", async () => {
    const p = await db.purchase.findUnique({ where: { id: purchaseId } });
    expect(p?.status).toBe("PAID");
  });
});
