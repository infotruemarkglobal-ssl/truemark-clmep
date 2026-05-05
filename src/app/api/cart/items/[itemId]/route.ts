import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function resolveItem(userId: string, itemId: string) {
  return db.cartItem.findFirst({
    where: { id: itemId, cart: { userId } },
  });
}

const patchSchema = z.object({
  seats: z.number().int().min(1).max(500),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  const item = await resolveItem(session.user.id, itemId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const updated = await db.cartItem.update({
    where: { id: itemId },
    data: { seats: body.data.seats },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  const item = await resolveItem(session.user.id, itemId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.cartItem.delete({ where: { id: itemId } });

  return NextResponse.json({ ok: true });
}
