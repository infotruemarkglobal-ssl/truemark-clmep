import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { z } from "zod";

// Keys are gated by settings:manage for both read and write — there's no
// separate settings:read permission, and in practice this has only ever
// been SUPER_ADMIN-accessible (the only role settings:manage is granted to).
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
  if (!(await can(session, "settings:manage"))) {
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
  if (!(await can(session, "settings:manage"))) {
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
