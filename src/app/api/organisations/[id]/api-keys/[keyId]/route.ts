import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { checkAccess } from "@/lib/organisation-members";

// DELETE /api/organisations/[id]/api-keys/[keyId] — revoke a key
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; keyId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, keyId } = await params;
  if (!(await checkAccess(session, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const key = await db.apiKey.findUnique({ where: { id: keyId } });
  if (!key || key.organisationId !== id) return NextResponse.json({ error: "API key not found" }, { status: 404 });

  await db.apiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });

  await auditLog({
    userId: session.user.id,
    action: "ORG_API_KEY_REVOKED",
    entityType: "ApiKey",
    entityId: keyId,
    metadata: { orgId: id, name: key.name },
  });

  return NextResponse.json({ ok: true });
}
