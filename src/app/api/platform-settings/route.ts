import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";
import { z } from "zod";

// Keys that are readable by any admin, writable only by SUPER_ADMIN.
const ALLOWED_KEYS = [
  "cert_director_name",
  "cert_director_signature_url",
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

const patchSchema = z.object({
  key: z.enum(ALLOWED_KEYS),
  value: z.string().min(1).max(500),
});

// GET /api/platform-settings — returns all allowed settings as a key→value map.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.platformSetting.findMany({
    where: { key: { in: [...ALLOWED_KEYS] } },
  });

  const settings: Record<AllowedKey, string | null> = {
    cert_director_name: null,
    cert_director_signature_url: null,
  };
  for (const row of rows) {
    if ((ALLOWED_KEYS as readonly string[]).includes(row.key)) {
      settings[row.key as AllowedKey] = row.value;
    }
  }

  return NextResponse.json(settings);
}

// PATCH /api/platform-settings — upsert a single setting.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 });
  }

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { key, value } = body.data;

  await db.platformSetting.upsert({
    where: { key },
    create: { key, value, updatedBy: session.user.id },
    update: { value, updatedBy: session.user.id },
  });

  await auditLog({
    userId: session.user.id,
    action: "PLATFORM_SETTING_UPDATED",
    entityType: "PlatformSetting",
    entityId: key,
    metadata: { key, value },
  });

  return NextResponse.json({ ok: true });
}
