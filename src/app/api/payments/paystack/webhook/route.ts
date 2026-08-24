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

  // ── 5. Find every Purchase row for this checkout ──────────────────────────
  // A cart checkout creates ONE Purchase per item, but only the first item's
  // row carries `reference` as its own paystackReference column (needed since
  // that column is unique and Paystack only issues one reference per checkout).
  // Every row's metadata carries the true shared reference regardless, so match
  // on either to reliably find all items in a multi-course cart, not just the
  // first (previously, non-first items were unreachable and stuck PENDING forever).
  const purchases = await db.purchase.findMany({
    where: { OR: [{ paystackReference: reference }, { metadata: { contains: reference } }] },
  });
  if (purchases.length === 0) {
    // Unknown reference — log but 200 so Paystack doesn't retry endlessly
    console.warn(`[webhook] Unknown paystackReference: ${reference}`);
    return NextResponse.json({ received: true });
  }

  // ── 6. Amount verification ────────────────────────────────────────────────
  // purchase.amount is stored in main currency units per item, EXCLUSIVE of VAT.
  // Paystack's paidSmallestUnit is the full checkout total INCLUSIVE of VAT (see
  // lib/tax.ts — applied on top of the item subtotal at checkout time but never
  // persisted per-item). Comparing for exact equality here would mismatch on
  // every VAT-applicable purchase (e.g. every Nigerian checkout, 7.5% VAT) and
  // permanently strand it PENDING. Use a floor check instead: reject only if
  // Paystack collected LESS than the sum of item subtotals — VAT and rounding
  // only ever add on top, never subtract, so this still catches genuine
  // price-manipulation attempts without false-flagging legitimate VAT-inclusive
  // payments.
  const expectedSubtotalSmallestUnit = Math.round(
    purchases.reduce((sum, p) => sum + p.amount, 0) * 100,
  );
  if (paidSmallestUnit < expectedSubtotalSmallestUnit) {
    // Significant security event — log with full detail for the ops team
    console.error(
      `[webhook] AMOUNT MISMATCH ref=${reference} ` +
      `expectedAtLeast=${expectedSubtotalSmallestUnit} received=${paidSmallestUnit} ` +
      `purchaseIds=${purchases.map((p) => p.id).join(",")}`
    );
    // Return 200 so Paystack stops retrying (retrying won't change the amount)
    // These purchases stay PENDING; finance team must investigate manually.
    return NextResponse.json({ received: true });
  }

  // ── 7. Idempotency + optimistic lock ──────────────────────────────────────
  // Two Paystack retries can arrive concurrently. Rather than read-then-update
  // (TOCTOU) on the whole batch, claim each row individually with a conditional
  // UPDATE that only matches while it's still PENDING — PostgreSQL serialises
  // this at row level, so if a concurrent delivery already claimed a row, our
  // update for that row simply matches zero rows and we skip it. This closes
  // the same race the original single-purchase code guarded against, extended
  // to a multi-item cart's whole set of purchases.
  const newlyPaid: typeof purchases = [];
  for (const p of purchases) {
    if (p.status === "PAID") continue;
    const claim = await db.purchase.updateMany({
      where: { id: p.id, status: { not: "PAID" } },
      data: { status: "PAID", paidAt: new Date(paid_at) },
    });
    if (claim.count === 1) newlyPaid.push(p);
  }
  if (newlyPaid.length === 0) {
    return NextResponse.json({ received: true });
  }

  // ── 8. Enrol each newly-paid item (or pool seats for org bulk purchases) ──
  for (const purchase of newlyPaid) {
    if (!purchase.userId || !purchase.courseId) continue;

    const meta = purchase.metadata ? (JSON.parse(purchase.metadata) as { organisationId?: string | null }) : {};
    const [course, candidate] = await Promise.all([
      db.course.findUnique({ where: { id: purchase.courseId }, select: { title: true, slug: true } }),
      db.user.findUnique({ where: { id: purchase.userId }, select: { email: true, firstName: true } }),
    ]);

    // Array form is PgBouncer transaction-pooling compatible (Supabase).
    // The interactive callback form is not — it holds a connection open across
    // async ticks, which conflicts with PgBouncer's connection reuse model.
    if (purchase.seats > 1 && (purchase.organisationId || meta.organisationId)) {
      const organisationId = purchase.organisationId ?? meta.organisationId!;
      const existingSeat = await db.courseSeat.findFirst({
        where: { organisationId, courseId: purchase.courseId, purchaseId: purchase.id },
      });
      if (!existingSeat) {
        await db.$transaction([
          db.courseSeat.create({
            data: { organisationId, courseId: purchase.courseId, purchaseId: purchase.id, totalSeats: purchase.seats },
          }),
          db.auditLog.create({
            data: {
              userId: purchase.userId,
              action: "PAYMENT_RECEIVED",
              entityType: "Purchase",
              entityId: purchase.id,
              metadata: JSON.stringify({ reference, amountPaidKobo: paidSmallestUnit, currency: event.data.currency, courseId: purchase.courseId, seats: purchase.seats }),
            },
          }),
        ]);
      }
    } else {
      await db.$transaction([
        db.enrolment.upsert({
          where: { userId_courseId: { userId: purchase.userId, courseId: purchase.courseId } },
          create: { userId: purchase.userId, courseId: purchase.courseId, purchaseId: purchase.id, status: "ACTIVE", progress: 0 },
          update: { status: "ACTIVE" },
        }),
        db.auditLog.create({
          data: {
            userId: purchase.userId,
            action: "PAYMENT_RECEIVED",
            entityType: "Purchase",
            entityId: purchase.id,
            metadata: JSON.stringify({ reference, amountPaidKobo: paidSmallestUnit, currency: event.data.currency, courseId: purchase.courseId }),
          },
        }),
      ]);
    }

    // Notification and email are best-effort — outside the transaction so a
    // failure here does not roll back the enrolment.
    await db.notification.create({
      data: {
        userId: purchase.userId,
        type: "ENROLMENT_CONFIRMATION",
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
