import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";
import { uploadFile, deleteFile } from "@/lib/storage";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg"];

// POST /api/platform-settings/director-signature — upload the Director of Certification's signature image.
// SUPER_ADMIN only.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== USER_ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 });
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
    return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buf = Buffer.from(bytes);

  // Magic byte validation — don't trust the client-supplied MIME type.
  const isPng  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  if (!isPng && !isJpeg) {
    return NextResponse.json({ error: "File header does not match a valid image type" }, { status: 400 });
  }

  const ext = isPng ? "png" : "jpg";
  const key = `signatures/director-sig.${ext}`;

  // Delete the previous director signature from storage before overwriting.
  const existing = await db.platformSetting.findUnique({
    where: { key: "cert_director_signature_url" },
  });
  if (existing?.value && !existing.value.startsWith("/")) {
    await deleteFile(existing.value).catch(() => {});
  }

  await uploadFile({ buffer: buf, key, contentType: file.type });

  // Store the storage key so resolveToBase64 in the cert PDF route reads it
  // from private-uploads/ rather than serving it as a public URL.
  await db.platformSetting.upsert({
    where: { key: "cert_director_signature_url" },
    create: { key: "cert_director_signature_url", value: key, updatedBy: session.user.id },
    update: { value: key, updatedBy: session.user.id },
  });

  await auditLog({
    userId: session.user.id,
    action: "PLATFORM_SETTING_UPDATED",
    entityType: "PlatformSetting",
    entityId: "cert_director_signature_url",
    metadata: { storageKey: key },
  });

  return NextResponse.json({ ok: true });
}
