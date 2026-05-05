import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  courseId: z.string().min(1),
  seats: z.number().int().min(1).max(500).default(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { courseId, seats } = body.data;

  const course = await db.course.findUnique({
    where: { id: courseId, status: "PUBLISHED" },
    select: { id: true, price: true },
  });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  if (course.price === 0) {
    return NextResponse.json({ error: "Free courses cannot be added to cart — enrol directly" }, { status: 400 });
  }

  // Upsert cart, then upsert item
  const cart = await db.cart.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id },
    update: {},
    select: { id: true },
  });

  const item = await db.cartItem.upsert({
    where: { cartId_courseId: { cartId: cart.id, courseId } },
    create: { cartId: cart.id, courseId, seats, unitPrice: course.price },
    update: { seats, unitPrice: course.price },
  });

  return NextResponse.json(item, { status: 201 });
}
