import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cart = await db.cart.findUnique({
    where: { userId: session.user.id },
    include: {
      items: {
        include: {
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
              thumbnailUrl: true,
              currency: true,
              price: true,
            },
          },
        },
        orderBy: { addedAt: "asc" },
      },
    },
  });

  return NextResponse.json(cart ?? { items: [] });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.cart.deleteMany({ where: { userId: session.user.id } });

  return NextResponse.json({ ok: true });
}
