import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { paystackVerify, toSmallestUnit } from "@/lib/paystack";

// Called by the frontend /payments/callback page after Paystack redirects back.
// Returns JSON so the callback page can show loading → success/failure UI.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference");
  const courseId = searchParams.get("courseId");

  if (!reference) {
    return NextResponse.json({ ok: false, status: "failed", error: "Payment reference missing" }, { status: 400 });
  }

  const result = await paystackVerify(reference);

  if (!result.status || result.data.status !== "success") {
    const failedPurchase = await db.purchase.findUnique({
      where: { paystackReference: reference },
      select: { id: true, userId: true, courseId: true },
    });
    await db.purchase.updateMany({
      where: { paystackReference: reference },
      data: { status: "FAILED" },
    });
    // ISO 27001 A.8.15 — log payment failure for financial audit trail
    if (failedPurchase?.userId) {
      await auditLog({
        userId: failedPurchase.userId,
        action: "PAYMENT_FAILED",
        entityType: "Purchase",
        entityId: failedPurchase.id,
        metadata: { reference, courseId: failedPurchase.courseId, reason: "PAYSTACK_VERIFICATION_FAILED" },
      }).catch(() => {});
    }
    return NextResponse.json({
      ok: false,
      status: "failed",
      courseId: failedPurchase?.courseId ?? courseId ?? null,
      error: "Payment verification failed. No charge was made.",
    });
  }

  // Update purchase
  const purchase = await db.purchase.findUnique({ where: { paystackReference: reference } });
  if (!purchase) {
    return NextResponse.json({ ok: false, status: "error", error: "Purchase record not found" }, { status: 404 });
  }

  if (purchase.status === "PAID") {
    // Already processed (idempotent)
    const slug = purchase.courseId
      ? await db.course.findFirst({ where: { id: purchase.courseId }, select: { slug: true } }).then((c) => c?.slug ?? null)
      : null;
    return NextResponse.json({ ok: true, status: "already_paid", courseSlug: slug });
  }

  // Verify the amount Paystack received matches what we recorded — prevents
  // price-manipulation attacks where the buyer alters the amount in-flight.
  // Paystack returns amount in kobo; purchase.amount is stored in naira.
  const expectedKobo = toSmallestUnit(purchase.amount, purchase.currency ?? "NGN");
  if (result.data.amount !== expectedKobo) {
    await db.purchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } });
    await auditLog({
      userId: purchase.userId ?? "unknown",
      action: "PAYMENT_AMOUNT_MISMATCH",
      entityType: "Purchase",
      entityId: purchase.id,
      metadata: {
        reference,
        expectedKobo,
        receivedKobo: result.data.amount,
        currency: purchase.currency,
      },
    }).catch(() => {});
    return NextResponse.json({
      ok: false,
      status: "failed",
      courseId: purchase.courseId,
      error: "Payment amount mismatch. Please contact support.",
    });
  }

  await db.purchase.update({
    where: { id: purchase.id },
    data: {
      status: "PAID",
      paidAt: new Date(result.data.paid_at),
    },
  });

  // Create or reset enrolment
  if (purchase.userId && purchase.courseId) {
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
    const enrolledCourse = purchase.courseId
      ? await db.course.findFirst({ where: { id: purchase.courseId }, select: { title: true, slug: true } })
      : null;
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

  const course = purchase.courseId
    ? await db.course.findFirst({ where: { id: purchase.courseId }, select: { slug: true } })
    : null;

  return NextResponse.json({ ok: true, status: "success", courseSlug: course?.slug ?? null });
}
