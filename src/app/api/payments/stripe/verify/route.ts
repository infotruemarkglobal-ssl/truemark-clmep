import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "session_id required" }, { status: 400 });

  const stripe = getStripe();
  let stripeSession: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>;
  try {
    stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ ok: false, status: "error", error: "Stripe session not found" }, { status: 404 });
  }

  if (stripeSession.payment_status !== "paid") {
    return NextResponse.json({ ok: false, status: stripeSession.payment_status });
  }

  // Check our DB to determine what was purchased
  const purchases = await db.purchase.findMany({
    where: { metadata: { contains: sessionId } },
    select: { id: true, courseId: true, seats: true, status: true },
  });

  const allPaid = purchases.every((p) => p.status === "PAID");
  const totalSeats = purchases.reduce((s, p) => s + p.seats, 0);
  const hasBulkSeats = purchases.some((p) => p.seats > 1);

  return NextResponse.json({
    ok: true,
    status: allPaid ? "paid" : "processing",
    hasBulkSeats,
    totalSeats,
    courseCount: purchases.length,
  });
}
