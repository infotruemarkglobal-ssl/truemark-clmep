import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";
import { uploadFile, getFileUrl } from "@/lib/storage";
import path from "path";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;

  const allowed = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.ORG_MANAGER] as string[];
  if (!allowed.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.user.role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: session.user.id, organisationId: orgId } },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await db.organisation.findUnique({ where: { id: orgId } });
  if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Only PDF, JPEG, PNG and WebP files are accepted" }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be smaller than 10 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Magic byte validation — don't trust the client-supplied MIME type.
  const isPdf  = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  const isPng  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isWebp = buffer.length > 11 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

  if (!isPdf && !isPng && !isJpeg && !isWebp) {
    return NextResponse.json({ error: "File header does not match a valid document type" }, { status: 400 });
  }

  const key = `org-documents/${orgId}-${Date.now()}${ext}`;

  const result = await uploadFile({ buffer, key, contentType: file.type });
  const url = await getFileUrl(result.key);

  await db.organisation.update({
    where: { id: orgId },
    data: { cacDocumentUrl: result.key }, // store the key, not a direct URL
  });

  await auditLog({
    userId: session.user.id,
    action: "ORG_DOCUMENT_UPLOADED",
    entityType: "Organisation",
    entityId: orgId,
    metadata: {
      contentType: file.type,
      sizeBytes: file.size,
      key: result.key,
      severity: "MEDIUM",
    },
  }).catch(() => {});

  return NextResponse.json({ url });
}
