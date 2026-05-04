import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";
import { uploadFile, deleteFile } from "@/lib/storage";

const ALLOWED_ROLES = [USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.SUPER_ADMIN] as string[];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg"];

// POST /api/users/me/signature — upload a signature image for use on certificates.
// Only CERTIFICATION_OFFICER and SUPER_ADMIN may upload.
// Accepts multipart/form-data with a single field named "signature".
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — only Certification Officers and Admins may upload a signature" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("signature");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Field 'signature' must be a file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG and JPEG images are accepted" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Signature image must be under 2 MB" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buf = Buffer.from(bytes);

  // Magic byte validation — don't trust the client-supplied MIME type.
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  if (!isPng && !isJpeg) {
    return NextResponse.json({ error: "File header does not match a valid image type" }, { status: 400 });
  }

  const ext = isPng ? "png" : "jpg";
  const key = `signatures/sig-${session.user.id}.${ext}`;

  // Delete the previous signature from storage before overwriting.
  const existing = await db.user.findUnique({
    where: { id: session.user.id },
    select: { signatureUrl: true },
  });
  if (existing?.signatureUrl) {
    await deleteFile(existing.signatureUrl).catch(() => {});
  }

  await uploadFile({ buffer: buf, key, contentType: file.type });

  // Store the storage key (not a public URL) so resolveToBase64 in the cert
  // PDF route reads it from private-uploads/, never via a public URL.
  await db.user.update({
    where: { id: session.user.id },
    data: { signatureUrl: key },
  });

  await auditLog({
    userId: session.user.id,
    action: "SIGNATURE_UPLOADED",
    entityType: "User",
    entityId: session.user.id,
    metadata: { storageKey: key },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/users/me/signature — remove the stored signature.
export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { signatureUrl: true },
  });

  if (user?.signatureUrl) {
    await deleteFile(user.signatureUrl).catch(() => {});
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { signatureUrl: null },
  });

  await auditLog({
    userId: session.user.id,
    action: "SIGNATURE_DELETED",
    entityType: "User",
    entityId: session.user.id,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
