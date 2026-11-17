import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { prepareAuditEntry } from "@/lib/audit";
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
      // Present when the card supports future off-session charges — this is
      // the entire basis for instalments (see src/lib/paystack.ts).
      authorization?: {
        authorization_code: string;
        reusable: boolean;
        card_type?: string;
        last4?: string;
        bank?: string;
        exp_month?: string;
        exp_year?: string;
      };
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
  // purchase.amount + purchase.vatAmount is the full expected charge per item,
  // INCLUSIVE of VAT (vatAmount is now persisted at checkout — see lib/tax.ts).
  // Still a floor check, not exact equality: rounding across currencies/gateways
  // can differ by a fraction of a unit, and it costs nothing to tolerate a
  // payment that rounds a hair high. What it no longer tolerates is a payment
  // missing VAT entirely, which the previous subtotal-only floor did.
  const expectedSubtotalSmallestUnit = Math.round(
    purchases.reduce((sum, p) => sum + p.amount + p.vatAmount, 0) * 100,
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
  const authorization = event.data.authorization;
  const newlyPaid: typeof purchases = [];
  for (const p of purchases) {
    if (p.status === "PAID") continue;
    const claim = await db.purchase.updateMany({
      where: { id: p.id, status: { not: "PAID" } },
      data: {
        status: "PAID",
        paidAt: new Date(paid_at),
        // Only stored when reusable — a non-reusable authorization_code
        // cannot be charged again, so keeping it would be actively
        // misleading to the instalment-plan creation step below.
        ...(authorization?.reusable ? { paystackAuthorizationCode: authorization.authorization_code } : {}),
        ...(authorization ? { paystackAuthorizationJson: JSON.stringify(authorization) } : {}),
      },
    });
    if (claim.count === 1) newlyPaid.push(p);
  }
  if (newlyPaid.length === 0) {
    return NextResponse.json({ received: true });
  }

  // ── 8. Enrol each newly-paid item (or pool seats for org bulk purchases) ──
  for (const purchase of newlyPaid) {
    if (!purchase.userId || !purchase.courseId) continue;

    const meta = purchase.metadata
      ? (JSON.parse(purchase.metadata) as { organisationId?: string | null; numberOfInstalments?: number; totalAmount?: number })
      : {};
    const [course, candidate] = await Promise.all([
      db.course.findUnique({ where: { id: purchase.courseId }, select: { title: true, slug: true } }),
      db.user.findUnique({ where: { id: purchase.userId }, select: { email: true, firstName: true } }),
    ]);

    // Array form is PgBouncer transaction-pooling compatible (Supabase).
    // The interactive callback form is not — it holds a connection open across
    // async ticks, which conflicts with PgBouncer's connection reuse model.
    // The audit row's hash+chain fields are computed just beforehand via
    // prepareAuditEntry() (its own short transaction, same shape auditLog()
    // already uses) so the array here can still include a correctly-chained
    // db.auditLog.create() rather than an unprotected raw insert.
    if (purchase.seats > 1 && (purchase.organisationId || meta.organisationId)) {
      const organisationId = purchase.organisationId ?? meta.organisationId!;
      const existingSeat = await db.courseSeat.findFirst({
        where: { organisationId, courseId: purchase.courseId, purchaseId: purchase.id },
      });
      if (!existingSeat) {
        const auditEntry = await prepareAuditEntry({
          userId: purchase.userId,
          action: "PAYMENT_RECEIVED",
          entityType: "Purchase",
          entityId: purchase.id,
          metadata: { reference, amountPaidKobo: paidSmallestUnit, currency: event.data.currency, courseId: purchase.courseId, seats: purchase.seats },
        });
        await db.$transaction([
          db.courseSeat.create({
            data: { organisationId, courseId: purchase.courseId, purchaseId: purchase.id, totalSeats: purchase.seats },
          }),
          db.auditLog.create({ data: auditEntry }),
        ]);
      }
    } else {
      const auditEntry = await prepareAuditEntry({
        userId: purchase.userId,
        action: "PAYMENT_RECEIVED",
        entityType: "Purchase",
        entityId: purchase.id,
        metadata: { reference, amountPaidKobo: paidSmallestUnit, currency: event.data.currency, courseId: purchase.courseId },
      });
      await db.$transaction([
        db.enrolment.upsert({
          where: { userId_courseId: { userId: purchase.userId, courseId: purchase.courseId } },
          create: { userId: purchase.userId, courseId: purchase.courseId, purchaseId: purchase.id, status: "ACTIVE", progress: 0 },
          update: { status: "ACTIVE" },
        }),
        db.auditLog.create({ data: auditEntry }),
      ]);
    }

    // ── Instalment plan setup ──────────────────────────────────────────────
    // The purchase itself IS instalment #1 (already charged and paid above);
    // this schedules the remaining N-1 charges, 30 days apart, against the
    // authorization captured above. If the authorization came back
    // non-reusable, Paystack cannot be asked to charge this card again —
    // the candidate keeps the access they already paid for, but the
    // remaining balance has to be collected outside this system.
    if (purchase.isInstalment && meta.numberOfInstalments && meta.totalAmount) {
      const n = meta.numberOfInstalments;
      const total = meta.totalAmount;
      const perInstalment = Math.round((total / n) * 100) / 100;
      const lastInstalment = Math.round((total - perInstalment * (n - 1)) * 100) / 100;

      const plan = await db.instalmentPlan.create({
        data: {
          purchaseId: purchase.id,
          totalAmount: total,
          numberOfInstalments: n,
          status: authorization?.reusable ? "ACTIVE" : "NEEDS_MANUAL_PAYMENT",
        },
      });

      await db.instalmentCharge.create({
        data: {
          planId: plan.id,
          instalmentNumber: 1,
          amount: purchase.amount,
          dueDate: new Date(paid_at),
          status: "PAID",
          paidAt: new Date(paid_at),
          paystackReference: reference,
        },
      });

      if (authorization?.reusable) {
        const remaining = Array.from({ length: n - 1 }, (_, i) => {
          const instalmentNumber = i + 2;
          return db.instalmentCharge.create({
            data: {
              planId: plan.id,
              instalmentNumber,
              amount: instalmentNumber === n ? lastInstalment : perInstalment,
              // 30 days between instalments — first future due date is 30
              // days after the down payment, not 30 days from "now" (a
              // delayed webhook delivery shouldn't compress the schedule).
              dueDate: new Date(new Date(paid_at).getTime() + (instalmentNumber - 1) * 30 * 24 * 60 * 60 * 1000),
            },
          });
        });
        await Promise.all(remaining);
      } else {
        console.warn(`[webhook] Instalment plan ${plan.id} created with non-reusable authorization — remaining ${n - 1} instalments need manual collection.`);
      }
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
