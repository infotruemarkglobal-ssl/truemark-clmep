import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = await db.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { sentAt: "desc" },
    take: 50,
  });

  return NextResponse.json(notifications);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patchSchema = z.object({
    ids: z.array(z.string().max(50)).max(100).optional(),
  });
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const ids = parsed.data.ids;

  const result =
    ids && ids.length > 0
      ? await db.notification.updateMany({
          where: { id: { in: ids }, userId: session.user.id },
          data: { read: true, readAt: new Date() },
        })
      : await db.notification.updateMany({
          where: { userId: session.user.id, read: false },
          data: { read: true, readAt: new Date() },
        });

  await auditLog({
    userId: session.user.id,
    action: "NOTIFICATIONS_READ",
    // Intentionally excludes notification content — messages may contain
    // certificate numbers, exam results, or other candidate-sensitive data.
    metadata: { count: result.count },
  });

  return NextResponse.json({ ok: true });
}
