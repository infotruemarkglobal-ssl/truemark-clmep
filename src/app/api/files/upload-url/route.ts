/**
 * POST /api/files/upload-url
 *
 * Returns a pre-signed S3 PUT URL so the browser can upload large files
 * (videos, SCORM packages) directly to S3, bypassing the Next.js process.
 *
 * MOTIVATION (OOM prevention)
 * ════════════════════════════
 * Uploading a 500 MB video through req.formData() buffers the entire body
 * in the Next.js process heap, risking OOM on serverless runtimes (Vercel
 * functions have a 1–3 GB limit and timeout at 60 s). The pre-signed PUT
 * approach keeps the Next.js function tiny: it only issues a signed URL and
 * records intent in the DB; S3 handles the bytes directly.
 *
 * FLOW
 * ════
 * 1. Client POST /api/files/upload-url  { type, filename, size }
 *    → Server returns { uploadUrl, key }
 * 2. Client PUT <uploadUrl> with the file body (direct to S3, no server hop)
 * 3. Client POST /api/files/upload-url/confirm  { key }
 *    → Server validates the object exists in S3, writes a DB record,
 *      fires the malware-scan Inngest event, returns { url } (proxy URL).
 *
 * NOTE: In local development (STORAGE_PROVIDER !== "s3") this endpoint
 * falls back to returning a server-side upload URL (/api/manage/upload)
 * since there is no local S3 to pre-sign against.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { USER_ROLES } from "@/lib/constants";
import { getPresignedUploadUrl } from "@/lib/storage";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg"] as const;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

const bodySchema = z.object({
  contentType: z.enum(ALLOWED_VIDEO_TYPES),
  filename: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_VIDEO_BYTES),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Shared bucket with /api/manage/upload — 20 upload initiations per hour per user.
  // Issuing a pre-signed URL is cheap, but each URL maps 1:1 to a scan event;
  // rate-limiting here caps the scan queue pressure and prevents wasting S3 PUTs.
  const uploadRl = await rateLimit(session.user.id, "file-upload", { limit: 20, windowMs: 60 * 60_000 });
  if (!uploadRl.success) {
    return NextResponse.json(
      { error: "Upload rate limit exceeded. Please wait before uploading more files." },
      { status: 429, headers: { "Retry-After": String(uploadRl.retryAfterSecs) } },
    );
  }

  const provider = process.env.STORAGE_PROVIDER ?? "local";
  if (provider !== "s3") {
    // In local dev, direct the client to the standard upload route instead
    return NextResponse.json({
      useDirectUpload: true,
      uploadEndpoint: "/api/manage/upload",
    });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { contentType, filename, size } = parsed.data;

  // Sanitize: UUID key prevents directory traversal and filename injection
  const rawExt = filename.split(".").pop() ?? "bin";
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
  const key = `videos/${crypto.randomUUID()}.${ext}`;

  const uploadUrl = await getPresignedUploadUrl({
    key,
    contentType,
    maxBytes: size,
    expiresIn: 300, // 5 minutes to start the upload
  });

  return NextResponse.json({ uploadUrl, key }, { status: 200 });
}
