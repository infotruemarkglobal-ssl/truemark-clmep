import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { checkAccess } from "@/lib/organisation-members";
import { generateApiKey, API_KEY_SCOPES } from "@/lib/api-keys";

// GET /api/organisations/[id]/api-keys — list keys (never returns the raw key)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await checkAccess(session, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const keys = await db.apiKey.findMany({
    where: { organisationId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, keyPrefix: true, scopes: true,
      lastUsedAt: true, createdAt: true, revokedAt: true,
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  return NextResponse.json(keys.map((k) => ({ ...k, scopes: JSON.parse(k.scopes) })));
}

const schema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
});

// POST /api/organisations/[id]/api-keys — create a key. The raw key is
// returned ONCE in this response and never stored or retrievable again —
// only its hash and an 12-char prefix (for the admin to tell keys apart)
// are persisted.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await checkAccess(session, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { rawKey, hashedKey, keyPrefix } = generateApiKey();

  const key = await db.apiKey.create({
    data: {
      organisationId: id,
      name: parsed.data.name,
      hashedKey,
      keyPrefix,
      scopes: JSON.stringify(parsed.data.scopes),
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    action: "ORG_API_KEY_CREATED",
    entityType: "ApiKey",
    entityId: key.id,
    metadata: { orgId: id, name: key.name, scopes: parsed.data.scopes },
  });

  return NextResponse.json({ id: key.id, name: key.name, keyPrefix: key.keyPrefix, rawKey }, { status: 201 });
}
