import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { uploadFile, getFileUrl } from "@/lib/storage";
import { inngest, EVENTS } from "@/inngest/client";
import { rateLimit } from "@/lib/rate-limit";

// Large file uploads (video ≤ 500 MB) can take up to 60s on slow connections.
export const maxDuration = 60; // seconds

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];

const ALLOWED_TYPES: Record<string, { mime: string[]; maxMb: number; dir: string }> = {
  pdf: { mime: ["application/pdf"], maxMb: 50, dir: "pdfs" },
  video: { mime: ["video/mp4", "video/webm", "video/ogg"], maxMb: 500, dir: "videos" },
  image: { mime: ["image/jpeg", "image/png", "image/webp", "image/gif"], maxMb: 10, dir: "images" },
};

/**
 * A03:2021 — Magic byte validation.
 * The client-supplied Content-Type (file.type) can be trivially forged.
 * Read the first 16 bytes and verify the file signature matches the declared MIME type.
 */
function checkMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const b = buffer;
  if (b.length < 4) return false;
  switch (mimeType) {
    case "application/pdf":
      return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
    case "image/jpeg":
      return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
    case "image/png":
      return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47; // \x89PNG
    case "image/gif":
      return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46; // GIF
    case "image/webp":
      return b.length >= 12 &&
        b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50; // WEBP
    case "video/mp4":
      // MP4 containers start with an ftyp box at offset 4
      return b.length >= 8 &&
        b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // ftyp
    case "video/webm":
      return b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3; // EBML
    case "video/ogg":
      return b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53; // OggS
    default:
      return false;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 20 uploads per hour per user — accommodates bulk content imports without
  // allowing automated abuse of the upload pipeline (malware scan bypass, etc.)
  const uploadRl = await rateLimit(session.user.id, "file-upload", { limit: 20, windowMs: 60 * 60_000 });
  if (!uploadRl.success) {
    return NextResponse.json(
      { error: "Upload rate limit exceeded. Please wait before uploading more files." },
      { status: 429, headers: { "Retry-After": String(uploadRl.retryAfterSecs) } },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const type = (formData.get("type") as string) ?? "pdf";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const config = ALLOWED_TYPES[type];
  if (!config) return NextResponse.json({ error: "Invalid file type category" }, { status: 400 });

  // A03:2021 — size must be enforced BEFORE reading full body to prevent memory exhaustion
  const maxBytes = config.maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File too large. Max ${config.maxMb} MB` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // A03:2021 — reject forged Content-Type; client-supplied file.type is untrusted
  if (!config.mime.includes(file.type)) {
    return NextResponse.json({
      error: `Invalid file type. Allowed: ${config.mime.join(", ")}`,
    }, { status: 400 });
  }

  // A03:2021 — verify magic bytes match the declared MIME type
  if (!checkMagicBytes(buffer, file.type)) {
    return NextResponse.json({ error: "File content does not match its declared type" }, { status: 400 });
  }

  // A03:2021 — sanitize extension to prevent path traversal and double-extension attacks
  // e.g. "shell.php.jpg" → "jpg", "../../etc/passwd" → stripped
  const rawExt = file.name.split(".").pop() ?? "bin";
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
  const key = `${config.dir}/${crypto.randomUUID()}.${ext}`;

  const result = await uploadFile({ buffer, key, contentType: file.type });

  // ISO 27001 A.8.15 — log every file upload for content integrity audit trail
  await auditLog({
    userId: session.user.id,
    action: "FILE_UPLOADED",
    entityType: "Upload",
    metadata: { key, contentType: file.type, sizeBytes: file.size, originalName: file.name },
  }).catch(() => {});

  // Fire async malware scan — does not block the response.
  // The scan function will quarantine and delete the file if a threat is found.
  await inngest.send({
    name: EVENTS.SCAN_UPLOAD,
    data: {
      key,
      uploadedBy: session.user.id,
      provider: result.provider,
      sizeBytes: file.size,
      contentType: file.type,
    },
  }).catch((err) => console.error("[upload] Failed to enqueue malware scan:", err));

  // Return the proxy URL (auth-gated) rather than a direct S3/public URL.
  // Callers that need a fresh URL later should call GET /api/files/url?key=...
  const url = await getFileUrl(result.key);

  return NextResponse.json({ url, key: result.key, name: file.name, size: file.size }, { status: 201 });
}
