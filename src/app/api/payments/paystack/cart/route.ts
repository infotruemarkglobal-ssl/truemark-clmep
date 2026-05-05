import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paystackInitialize, toSmallestUnit } from "@/lib/paystack";
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
        include: { course: { select: { id: true, title: true, price: true, currency: true } } },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

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

  const country = profile?.country ?? membership?.organisation.country ?? "Nigeria";
  const organisationId = membership?.organisationId ?? null;

  // All items must share currency (validated client-side)
  const currency = cart.items[0]!.course.currency;
  const subtotal = cart.items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.seats,
    0,
  );
  const vat = calculateVAT(country, subtotal);
  const total = subtotal + vat.amount;

  const reference = `CLMEP-CART-${session.user.id.slice(0, 8)}-${cart.id.slice(0, 8)}-${Date.now()}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  // Persist one Purchase per cart item
  for (const item of cart.items) {
    const isFirst = item === cart.items[0];
    await db.purchase.create({
      data: {
        userId: session.user.id,
        courseId: item.courseId,
        organisationId: organisationId ?? undefined,
        paystackReference: isFirst ? reference : `${reference}-${item.courseId.slice(0, 6)}`,
        amount: Number(item.unitPrice) * item.seats,
        currency,
        seats: item.seats,
        status: "PENDING",
        description: `${item.course.title}${item.seats > 1 ? ` × ${item.seats} seats` : ""}`,
        metadata: JSON.stringify({
          cartId: cart.id,
          courseId: item.courseId,
          seats: item.seats,
          paystackReference: reference,
        }),
      },
    });
  }

  const result = await paystackInitialize({
    email: session.user.email!,
    amount: toSmallestUnit(total, currency),
    currency,
    reference,
    callback_url: `${appUrl}/payments/callback?reference=${reference}&provider=paystack`,
    metadata: {
      cartId: cart.id,
      userId: session.user.id,
      organisationId: organisationId ?? null,
      country,
      items: cart.items.map((i) => ({ courseId: i.courseId, seats: i.seats, unitPrice: Number(i.unitPrice) })),
    },
  });

  if (!result.status || !result.data?.authorization_url) {
    return NextResponse.json(
      { error: result.message ?? "Payment gateway error — please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    authorizationUrl: result.data.authorization_url,
    reference,
    amount: total,
    currency,
  });
}
