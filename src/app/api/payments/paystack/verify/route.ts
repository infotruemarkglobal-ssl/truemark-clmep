import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { paystackVerify, toSmallestUnit } from "@/lib/paystack";

// Called by the frontend /payments/callback page after Paystack redirects back.
// Returns JSON so the callback page can show loading → success/failure UI.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, status: "failed", error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference");
  const courseId = searchParams.get("courseId");

  if (!reference) {
    return NextResponse.json({ ok: false, status: "failed", error: "Payment reference missing" }, { status: 400 });
  }

  const result = await paystackVerify(reference);

  // A cart checkout creates ONE Purchase per item, but only the first item's row
  // carries `reference` as its own paystackReference column (that column is unique
  // and Paystack only issues one reference per checkout). Every row's metadata
  // carries the true shared reference regardless, so match on either to reliably
  // find all items in a multi-course cart, not just the first.
  const purchases = await db.purchase.findMany({
    where: { OR: [{ paystackReference: reference }, { metadata: { contains: reference } }] },
  });

  if (!result.status || result.data.status !== "success") {
    await db.purchase.updateMany({
      where: { id: { in: purchases.map((p) => p.id) } },
      data: { status: "FAILED" },
    });
    for (const p of purchases) {
      if (p.userId) {
        await auditLog({
          userId: p.userId,
          action: "PAYMENT_FAILED",
          entityType: "Purchase",
          entityId: p.id,
          metadata: { reference, courseId: p.courseId, reason: "PAYSTACK_VERIFICATION_FAILED" },
        }).catch(() => {});
      }
    }
    const failedCourseSlug = purchases.length === 1 && purchases[0]!.courseId
      ? await db.course.findUnique({ where: { id: purchases[0]!.courseId! }, select: { slug: true } }).then((c) => c?.slug ?? null)
      : null;
    return NextResponse.json({
      ok: false,
      status: "failed",
      courseSlug: failedCourseSlug,
      error: "Payment verification failed. No charge was made.",
    });
  }

  if (purchases.length === 0) {
    return NextResponse.json({ ok: false, status: "error", error: "Purchase record not found" }, { status: 404 });
  }

  // Scope to the authenticated user — prevents one user from processing another's payment.
  if (purchases.some((p) => p.userId && p.userId !== session.user.id)) {
    return NextResponse.json({ ok: false, status: "error", error: "Forbidden" }, { status: 403 });
  }

  if (purchases.every((p) => p.status === "PAID")) {
    // Already processed (idempotent)
    const slug = purchases.length === 1 && purchases[0]!.courseId
      ? await db.course.findFirst({ where: { id: purchases[0]!.courseId! }, select: { slug: true } }).then((c) => c?.slug ?? null)
      : null;
    return NextResponse.json({ ok: true, status: "already_paid", courseSlug: slug });
  }

  // Verify the amount Paystack received covers what we recorded — prevents
  // price-manipulation attacks where the buyer alters the amount in-flight.
  // purchase.amount is stored per item, EXCLUSIVE of VAT; Paystack's amount is
  // the full checkout total INCLUSIVE of VAT (applied at checkout, never
  // persisted per-item — see lib/tax.ts). Use a floor check, not exact equality:
  // VAT and rounding only ever add on top, never subtract, so this still catches
  // genuine price manipulation without false-flagging legitimate VAT-inclusive
  // payments.
  const expectedSubtotalKobo = purchases.reduce((sum, p) => sum + toSmallestUnit(p.amount, p.currency ?? "NGN"), 0);
  if (result.data.amount < expectedSubtotalKobo) {
    await db.purchase.updateMany({ where: { id: { in: purchases.map((p) => p.id) } }, data: { status: "FAILED" } });
    await auditLog({
      userId: purchases[0]?.userId ?? "unknown",
      action: "PAYMENT_AMOUNT_MISMATCH",
      entityType: "Purchase",
      entityId: purchases[0]!.id,
      metadata: {
        reference,
        expectedAtLeastKobo: expectedSubtotalKobo,
        receivedKobo: result.data.amount,
        purchaseIds: purchases.map((p) => p.id),
      },
    }).catch(() => {});
    return NextResponse.json({
      ok: false,
      status: "failed",
      courseId: purchases[0]?.courseId,
      error: "Payment amount mismatch. Please contact support.",
    });
  }

  // Claim each row individually with a conditional UPDATE that only matches
  // while still PENDING — closes the race if this call overlaps a concurrent
  // webhook delivery or a duplicate client call (double-click, two tabs, a
  // retried fetch) for the same reference, and ensures we only enrol/notify
  // for purchases genuinely transitioning in this request.
  const newlyPaid: typeof purchases = [];
  for (const p of purchases) {
    if (p.status === "PAID") continue;
    const claim = await db.purchase.updateMany({
      where: { id: p.id, status: { not: "PAID" } },
      data: { status: "PAID", paidAt: new Date(result.data.paid_at) },
    });
    if (claim.count === 1) newlyPaid.push(p);
  }

  // Create or reset enrolment for each newly-paid item
  let courseSlug: string | null = null;
  for (const purchase of newlyPaid) {
    if (!purchase.userId || !purchase.courseId) continue;

    await db.enrolment.upsert({
      where: { userId_courseId: { userId: purchase.userId, courseId: purchase.courseId } },
      create: {
        userId: purchase.userId,
        courseId: purchase.courseId,
        purchaseId: purchase.id,
        status: "ACTIVE",
        progress: 0,
      },
      // Re-enrollment: reset progress so user starts from the beginning
      update: { status: "ACTIVE", progress: 0, completedAt: null, purchaseId: purchase.id },
    });

    // Send enrolment notification after payment
    const enrolledCourse = await db.course.findFirst({
      where: { id: purchase.courseId },
      select: { title: true, slug: true },
    });
    if (purchases.length === 1) courseSlug = enrolledCourse?.slug ?? null;
    await db.notification.create({
      data: {
        userId: purchase.userId,
        type: "PAYMENT_CONFIRMATION",
        title: "Payment confirmed — you're enrolled!",
        message: enrolledCourse
          ? `Your payment of ${purchase.currency} ${purchase.amount.toLocaleString()} has been confirmed. You are now enrolled in "${enrolledCourse.title}".`
          : `Your payment of ${purchase.currency} ${purchase.amount.toLocaleString()} has been confirmed. You are now enrolled.`,
        link: enrolledCourse?.slug ? `/courses/${enrolledCourse.slug}` : "/courses",
      },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status: "success", courseSlug });
}
