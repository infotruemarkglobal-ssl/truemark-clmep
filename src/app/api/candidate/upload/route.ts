import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { uploadFile, getFileUrl } from "@/lib/storage";
import { inngest, EVENTS } from "@/inngest/client";
import { rateLimit } from "@/lib/rate-limit";

// Candidates may only upload evidence documents — no video, no SCORM.
// Size limits are tighter than the admin upload route to constrain storage
// per-candidate and reduce scan cost.
const MIME_CONFIG: Record<string, { maxMb: number }> = {
  "application/pdf": { maxMb: 10 },
  "image/jpeg":      { maxMb: 5  },
  "image/png":       { maxMb: 5  },
  "image/webp":      { maxMb: 5  },
};

// A03:2021 — Magic byte validation (same cases as /api/manage/upload).
// The client-supplied Content-Type (file.type) can be trivially forged;
// verify the actual file signature before storing or scanning.
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
    case "image/webp":
      return (
        b.length >= 12 &&
        b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50   // WEBP
      );
    default:
      return false;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only CANDIDATE role — admins/trainers/officers use /api/manage/upload.
  if (session.user.role !== USER_ROLES.CANDIDATE) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 5 uploads per hour per candidate — strictly less than the admin route (20/hr).
  // Enough for a complete appeals package; low enough to prevent storage abuse.
  const rl = await rateLimit(session.user.id, "candidate-file-upload", {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Upload rate limit exceeded. You can upload up to 5 files per hour." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const mimeConfig = MIME_CONFIG[file.type];
  if (!mimeConfig) {
    return NextResponse.json(
      { error: "Invalid file type. Accepted formats: PDF, JPEG, PNG, WebP" },
      { status: 400 },
    );
  }

  // Enforce size limit before reading the full buffer — prevents memory exhaustion
  // and gives a meaningful error before the expensive arrayBuffer() call.
  const maxBytes = mimeConfig.maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large. Maximum size for ${file.type}: ${mimeConfig.maxMb} MB` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // A03:2021 — reject any file whose actual bytes do not match the declared MIME type.
  if (!checkMagicBytes(buffer, file.type)) {
    return NextResponse.json(
      { error: "File content does not match its declared type" },
      { status: 400 },
    );
  }

  // Sanitise the extension — prevents path traversal and double-extension attacks
  // (e.g. "payload.php.jpg" → "jpg", "../../etc/passwd" → stripped).
  const rawExt = file.name.split(".").pop() ?? "bin";
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";

  // Namespace under the userId so keys never collide across candidates and so
  // admin tooling can easily scope to a single candidate's evidence.
  const key = `evidence/${session.user.id}/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;

  const result = await uploadFile({ buffer, key, contentType: file.type });

  // ISO 27001 A.8.15 — audit every candidate evidence upload.
  // Never log the file buffer or file contents — only metadata.
  await auditLog({
    userId: session.user.id,
    action: "CANDIDATE_EVIDENCE_UPLOADED",
    entityType: "Upload",
    metadata: { key, mimeType: file.type, fileSize: file.size },
  }).catch(() => {});

  // Fire async malware scan — does not block the response.
  // The scan function quarantines and deletes the file if a threat is found.
  await inngest.send({
    name: EVENTS.SCAN_UPLOAD,
    data: {
      key,
      uploadedBy: session.user.id,
      provider: result.provider,
      sizeBytes: file.size,
      contentType: file.type,
    },
  }).catch((err) => console.error("[candidate-upload] Failed to enqueue malware scan:", err));

  const url = await getFileUrl(result.key);

  return NextResponse.json({ url, key: result.key }, { status: 201 });
}
