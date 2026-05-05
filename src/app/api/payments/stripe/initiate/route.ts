import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { calculateVAT } from "@/lib/tax";
import { rateLimit } from "@/lib/rate-limit";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(session.user.id, "payment-initiate", { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many payment requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const cart = await db.cart.findUnique({
    where: { userId: session.user.id },
    include: {
      items: {
        include: { course: { select: { id: true, title: true, price: true, currency: true, slug: true } } },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  // Detect org membership for metadata and country
  const membership = await db.organisationMember.findFirst({
    where: { userId: session.user.id },
    select: {
      organisationId: true,
      organisation: { select: { country: true } },
    },
  });

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { country: true },
  });

  const country = profile?.country ?? membership?.organisation.country ?? "";
  const organisationId = membership?.organisationId ?? null;

  const subtotal = cart.items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.seats,
    0,
  );
  const vat = calculateVAT(country, subtotal);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  // Build Stripe line items
  const lineItems = cart.items.map((item) => ({
    price_data: {
      currency: item.course.currency.toLowerCase(),
      product_data: {
        name: item.seats > 1
          ? `${item.course.title} (${item.seats} seats)`
          : item.course.title,
      },
      unit_amount: Math.round(Number(item.unitPrice) * 100),
    },
    quantity: item.seats,
  }));

  // Add VAT as a separate line item if applicable
  if (vat.rate > 0) {
    const primaryCurrency = cart.items[0]!.course.currency.toLowerCase();
    lineItems.push({
      price_data: {
        currency: primaryCurrency,
        product_data: { name: vat.label },
        unit_amount: Math.round(vat.amount * 100),
      },
      quantity: 1,
    });
  }

  // Create Stripe Checkout Session first to get the session ID
  const stripe = getStripe();
  const stripeSession = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    success_url: `${appUrl}/payments/callback?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/cart`,
    customer_email: session.user.email!,
    metadata: {
      userId: session.user.id,
      cartId: cart.id,
      organisationId: organisationId ?? "",
      country,
    },
  });

  // Persist one Purchase record per cart item (for audit trail + seat tracking)
  for (const item of cart.items) {
    const isFirst = item === cart.items[0];
    await db.purchase.create({
      data: {
        userId: session.user.id,
        courseId: item.courseId,
        organisationId: organisationId ?? undefined,
        stripeSessionId: isFirst ? stripeSession.id : undefined,
        amount: Number(item.unitPrice) * item.seats,
        currency: item.course.currency,
        seats: item.seats,
        status: "PENDING",
        description: `${item.course.title}${item.seats > 1 ? ` × ${item.seats} seats` : ""}`,
        metadata: JSON.stringify({
          stripeSessionId: stripeSession.id,
          courseId: item.courseId,
          seats: item.seats,
          cartId: cart.id,
        }),
      },
    });
  }

  return NextResponse.json({ url: stripeSession.url });
}
