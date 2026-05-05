import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { inngest, EVENTS } from "@/inngest/client";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig ?? "", webhookSecret);
  } catch (err) {
    console.warn("[stripe/webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  const { userId, cartId, organisationId, country } = session.metadata ?? {};

  if (!userId || !cartId) {
    console.error("[stripe/webhook] Missing metadata on session", session.id);
    return NextResponse.json({ received: true });
  }

  // Idempotency: find all pending purchases for this Stripe session
  const purchases = await db.purchase.findMany({
    where: {
      metadata: { contains: session.id },
      status: { not: "PAID" },
    },
  });

  if (purchases.length === 0) {
    // Already processed
    return NextResponse.json({ received: true });
  }

  const paidAt = new Date();

  try {
    for (const purchase of purchases) {
      const meta = purchase.metadata
        ? (JSON.parse(purchase.metadata) as { courseId?: string; seats?: number; cartId?: string })
        : {};
      const courseId = purchase.courseId ?? meta.courseId;
      const seats = purchase.seats ?? meta.seats ?? 1;

      if (!courseId) {
        await db.purchase.update({
          where: { id: purchase.id },
          data: { status: "PAID", paidAt, stripeSessionId: session.id },
        });
        continue;
      }

      if (seats > 1 && organisationId) {
        // Bulk purchase → mark paid + create CourseSeat pool atomically
        const existing = await db.courseSeat.findFirst({
          where: { organisationId, courseId, purchaseId: purchase.id },
        });
        if (!existing) {
          await db.$transaction([
            db.purchase.update({
              where: { id: purchase.id },
              data: { status: "PAID", paidAt, stripeSessionId: session.id },
            }),
            db.courseSeat.create({
              data: { organisationId, courseId, purchaseId: purchase.id, totalSeats: seats },
            }),
          ]);
        } else {
          await db.purchase.update({
            where: { id: purchase.id },
            data: { status: "PAID", paidAt, stripeSessionId: session.id },
          });
        }
      } else {
        // Single seat → mark paid + enrol atomically
        await db.$transaction([
          db.purchase.update({
            where: { id: purchase.id },
            data: { status: "PAID", paidAt, stripeSessionId: session.id },
          }),
          db.enrolment.upsert({
            where: { userId_courseId: { userId, courseId } },
            create: {
              userId,
              courseId,
              purchaseId: purchase.id,
              status: "ACTIVE",
              progress: 0,
              organisationId: organisationId || undefined,
              registrationSource: organisationId ? "ORG_ASSIGNED" : "SELF",
            },
            update: { status: "ACTIVE", progress: 0, completedAt: null, purchaseId: purchase.id },
          }),
        ]);
      }
    }
  } catch (err) {
    console.error("[stripe/webhook] transaction failed:", err);
    return NextResponse.json({ error: "Transaction failed" }, { status: 500 });
  }

  // Notify the buyer
  await db.notification.create({
    data: {
      userId,
      type: "PAYMENT_CONFIRMATION",
      title: "Payment confirmed",
      message: purchases.length === 1 && purchases[0]!.seats <= 1
        ? "Your payment was confirmed and you are now enrolled."
        : `Your payment was confirmed. ${purchases.reduce((s, p) => s + p.seats, 0)} seat(s) are ready to assign.`,
      link: organisationId ? "/organisations/members" : "/courses",
    },
  }).catch(() => {});

  // Email confirmation via Inngest (idempotent key = session ID)
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } });
  if (user) {
    await inngest.send({
      id: `stripe-enrolment-confirm-${session.id}`,
      name: EVENTS.SEND_ENROLMENT_CONFIRM,
      data: {
        to: user.email,
        firstName: user.firstName,
        courseTitle: purchases.length === 1 ? (purchases[0]!.description ?? "your course") : `${purchases.length} courses`,
        courseSlug: null,
        userId,
      },
    }).catch((err) => console.error("[stripe/webhook] inngest send failed:", err));
  }

  // Clear the cart
  await db.cart.deleteMany({ where: { id: cartId } });

  return NextResponse.json({ received: true });
}
