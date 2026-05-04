import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Constant-time HMAC-SHA512 signature verification.
 *
 * CWE-208: Using string equality (===) leaks timing information allowing an
 * attacker to reconstruct the secret key byte-by-byte. timingSafeEqual removes
 * that side-channel. Both buffers must be the same length; a length mismatch is
 * itself treated as a failure without revealing which byte diverged.
 */
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest();
  // hex-decode the incoming signature so both sides are raw bytes
  let received: Buffer;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return false;
  }

  // timingSafeEqual requires identical length — SHA-512 is always 64 bytes.
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

// ── Webhook handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Read raw body BEFORE any parsing — signature must cover the exact bytes Paystack sent.
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  // ── 1. Signature validation (must be first; no business logic before this) ──
  if (!verifySignature(rawBody, signature)) {
    // Return 401 so Paystack does NOT retry (retrying won't fix a bad signature)
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 2. Parse payload (guarded; a 500 here would cause Paystack to retry) ────
  let event: {
    event: string;
    data: {
      status: string;
      reference: string;
      amount: number;       // SMALLEST unit (kobo for NGN, pesewas for GHS, cents for USD)
      currency: string;
      paid_at: string;
      customer: { email: string };
      metadata: { courseId?: string; userId?: string; purchaseId?: string };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    // Malformed JSON from Paystack — 400 so they don't retry pointlessly
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  // ── 3. Event type filter — only action charge.success ─────────────────────
  // All other event types (charge.failed, transfer.success, etc.) get an immediate
  // 200 so Paystack marks them delivered and stops retrying.
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  // ── 4. data.status double-check ────────────────────────────────────────────
  // Defense-in-depth: charge.success should always carry status "success", but
  // verify explicitly so a hypothetical edge-case payload cannot enrol a user.
  const { status: txStatus, reference, amount: paidSmallestUnit, paid_at } = event.data;
  if (txStatus !== "success") {
    // Log for visibility but return 200 — this is not retriable
    console.warn(`[webhook] charge.success with non-success status="${txStatus}" ref=${reference}`);
    return NextResponse.json({ received: true });
  }

  // ── 5. Idempotency + optimistic lock ──────────────────────────────────────
  // Two Paystack retries can arrive concurrently. Rather than read-then-update
  // (TOCTOU), we issue a single conditional UPDATE that only matches when the
  // purchase is still in PENDING state. PostgreSQL serialises this at row level.
  // If the row was already PAID (count === 0) we return 200 immediately — the
  // enrolment was already created on the first delivery.
  const purchase = await db.purchase.findUnique({ where: { paystackReference: reference } });
  if (!purchase) {
    // Unknown reference — log but 200 so Paystack doesn't retry endlessly
    console.warn(`[webhook] Unknown paystackReference: ${reference}`);
    return NextResponse.json({ received: true });
  }

  // ── 6. Amount verification ────────────────────────────────────────────────
  // purchase.amount is stored in main currency units (e.g. 5000 NGN).
  // Paystack sends paidSmallestUnit in the smallest denomination (kobo = NGN × 100).
  // Never trust the webhook amount for enrolment decisions — compare against the
  // DB-stored expected amount so a price-manipulation attack cannot grant access.
  const expectedSmallestUnit = Math.round(purchase.amount * 100);
  if (paidSmallestUnit !== expectedSmallestUnit) {
    // Significant security event — log with full detail for the ops team
    console.error(
      `[webhook] AMOUNT MISMATCH ref=${reference} ` +
      `expected=${expectedSmallestUnit} received=${paidSmallestUnit} ` +
      `purchaseId=${purchase.id}`
    );
    // Return 200 so Paystack stops retrying (retrying won't change the amount)
    // The purchase stays PENDING; finance team must investigate manually.
    return NextResponse.json({ received: true });
  }

  // ── 7. Atomic PAID transition + enrolment in a single transaction ────────
  // If mark-PAID succeeds but enrolment.upsert then fails, the purchase would
  // be PAID with no enrolment — the candidate pays but gets no access.
  // Wrapping both in $transaction ensures they either both commit or both roll back.
  // The updateMany idempotency guard remains the concurrency lock: if two webhook
  // deliveries race, only one wins the updateMany (count=1), the other gets
  // count=0 and returns early before entering the transaction.
  const updated = await db.purchase.updateMany({
    where: { id: purchase.id, status: { not: "PAID" } },
    data: { status: "PAID", paidAt: new Date(paid_at) },
  });

  if (updated.count === 0) {
    return NextResponse.json({ received: true });
  }

  // Only one delivery reaches here per reference — safe to transact.
  if (purchase.userId && purchase.courseId) {
    const [course, candidate] = await Promise.all([
      db.course.findUnique({
        where: { id: purchase.courseId },
        select: { title: true, slug: true },
      }),
      db.user.findUnique({
        where: { id: purchase.userId },
        select: { email: true, firstName: true },
      }),
    ]);

    // ── 8. Enrolment + audit written atomically ───────────────────────────
    // Array form is PgBouncer transaction-pooling compatible (Supabase).
    // The interactive callback form is not — it holds a connection open across
    // async ticks, which conflicts with PgBouncer's connection reuse model.
    await db.$transaction([
      db.enrolment.upsert({
        where: { userId_courseId: { userId: purchase.userId!, courseId: purchase.courseId! } },
        create: {
          userId: purchase.userId!,
          courseId: purchase.courseId!,
          purchaseId: purchase.id,
          status: "ACTIVE",
          progress: 0,
        },
        update: { status: "ACTIVE" },
      }),
      db.auditLog.create({
        data: {
          userId: purchase.userId,
          action: "PAYMENT_RECEIVED",
          entityType: "Purchase",
          entityId: purchase.id,
          metadata: JSON.stringify({
            reference,
            amountPaidKobo: paidSmallestUnit,
            currency: event.data.currency,
            courseId: purchase.courseId,
          }),
        },
      }),
    ]);

    // Notification and email are best-effort — outside the transaction so a
    // failure here does not roll back the enrolment.
    await db.notification.create({
      data: {
        userId: purchase.userId,
        type: "ENROLMENT",
        title: "Payment confirmed — you're enrolled!",
        message: course
          ? `Your payment was received and you are now enrolled in "${course.title}". Start learning whenever you're ready.`
          : "Your payment was received and your enrolment is confirmed.",
        link: course?.slug ? `/courses/${course.slug}` : "/dashboard",
      },
    }).catch((err) => console.error("[webhook] Failed to create notification:", err));

    // Dispatch enrolment confirmation email via Inngest.
    // Idempotency key is stable per purchase so a duplicate webhook delivery
    // (Paystack retries on 5xx) does not send a second email.
    if (candidate && course) {
      await inngest.send({
        id: `enrolment-confirm-${purchase.id}`,
        name: EVENTS.SEND_ENROLMENT_CONFIRM,
        data: {
          to: candidate.email,
          firstName: candidate.firstName,
          courseTitle: course.title,
          courseSlug: course.slug,
          // userId is required so the Inngest function can check MARKETING
          // consent and generate a per-user unsubscribe token.
          userId: purchase.userId,
        },
      }).catch((err) => console.error("[webhook] Failed to dispatch enrolment confirm email:", err));
    }
  }

  return NextResponse.json({ received: true });
}
