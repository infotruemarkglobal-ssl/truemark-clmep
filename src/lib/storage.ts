/**
 * Storage abstraction — local filesystem in development, S3-compatible in production.
 *
 * Set STORAGE_PROVIDER=s3 plus AWS_* env variables to switch to cloud storage.
 *
 * SECURITY DESIGN
 * ───────────────
 * • Local:  Files are stored in private-uploads/ (NOT public/).
 *           Never in public/ — that directory is served by Next.js without auth.
 *           Served via /api/files/url which checks authentication.
 *
 * • S3/R2:  Objects are uploaded with no ACL (bucket-level block-public-access must
 *           be ON). Download URLs are pre-signed with a 15-minute expiry.
 *           Direct public S3 URLs are never returned to clients.
 *
 * OOM NOTE  For large files (videos, SCORM packages), callers should use
 *           getPresignedUploadUrl() so the browser uploads directly to S3,
 *           bypassing the Next.js process entirely. The POST /api/manage/upload
 *           route is only used for files that must pass through the server for
 *           magic-byte validation (PDFs, images). Videos should use the
 *           /api/files/upload-url endpoint instead.
 */

import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";

export type UploadResult = {
  /** storage key / path — pass this to getFileUrl() to get a serving URL */
  key: string;
  provider: string;
};

// ─── S3 client factory (singleton-ish per request) ────────────────────────────

export async function makeS3Client() {
  // For Cloudflare R2: set AWS_REGION=auto and AWS_S3_ENDPOINT to your R2 endpoint
  // (https://[accountid].r2.cloudflarestorage.com). forcePathStyle is already set correctly.
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1",
    endpoint: process.env.AWS_S3_ENDPOINT, // set for Cloudflare R2
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: !!process.env.AWS_S3_ENDPOINT, // required for R2
  });
}

function getBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("AWS_S3_BUCKET is not configured");
  return bucket;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadFile({
  buffer,
  key,
  contentType,
}: {
  buffer: Buffer;
  key: string;
  contentType: string;
}): Promise<UploadResult> {
  const provider = process.env.STORAGE_PROVIDER ?? "local";

  if (provider === "s3") {
    return uploadToS3({ buffer, key, contentType });
  }

  return uploadToLocal({ buffer, key });
}

async function uploadToLocal({ buffer, key }: { buffer: Buffer; key: string }): Promise<UploadResult> {
  // Store outside public/ so Next.js cannot serve the file without auth.
  const uploadRoot = path.join(process.cwd(), "private-uploads");
  const filePath = path.join(uploadRoot, key);

  // CWE-22: ensure the resolved path stays within the upload root
  const safeRoot = path.resolve(uploadRoot);
  if (!path.resolve(filePath).startsWith(safeRoot + path.sep)) {
    throw new Error("Path traversal detected in upload key");
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);

  return { key, provider: "local" };
}

async function uploadToS3({
  buffer,
  key,
  contentType,
}: {
  buffer: Buffer;
  key: string;
  contentType: string;
}): Promise<UploadResult> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await makeS3Client();

  // No ACL param — bucket must have "Block all public access" enabled.
  // Any public ACL would be rejected by the bucket policy.
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // ServerSideEncryption: "AES256", // uncomment for S3 SSE-S3
    }),
  );

  return { key, provider: "s3" };
}

// ─── Pre-signed upload URL (browser → S3 direct; avoids OOM for large files) ─

/**
 * Returns a pre-signed PUT URL valid for `expiresIn` seconds (default 5 min).
 * The browser PUTs the file body directly to this URL, never passing through
 * the Next.js process. After the upload completes, the client calls the
 * confirm endpoint which records the key in the DB.
 */
export async function getPresignedUploadUrl({
  key,
  contentType,
  maxBytes,
  expiresIn = 300,
}: {
  key: string;
  contentType: string;
  maxBytes: number;
  expiresIn?: number;
}): Promise<string> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await makeS3Client();

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: contentType,
      ContentLength: maxBytes, // prevents uploading a larger file than declared
    }),
    { expiresIn },
  );
}

// ─── Pre-signed download URL (max 15 minutes per OWASP recommendation) ────────

const DOWNLOAD_EXPIRY_SECS = 15 * 60; // 15 minutes

/**
 * Returns a URL that grants temporary read access to a stored file.
 * • S3/R2: pre-signed GetObject URL, expires in 15 minutes.
 * • Local: the /api/files/url proxy route (auth checked server-side there).
 */
export async function getFileUrl(key: string): Promise<string> {
  const provider = process.env.STORAGE_PROVIDER ?? "local";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  if (provider === "s3") {
    return getPresignedDownloadUrl(key);
  }

  // Local: return the proxy URL; the route handler enforces authentication.
  return `${appUrl}/api/files/url?key=${encodeURIComponent(key)}`;
}

async function getPresignedDownloadUrl(key: string): Promise<string> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await makeS3Client();

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: DOWNLOAD_EXPIRY_SECS },
  );
}

// ─── Public URL (stable; no expiry) ──────────────────────────────────────────

/**
 * Returns a stable, non-expiring public URL for a stored file.
 *
 * Use this for assets that must be embeddable in external contexts where a
 * 15-minute pre-signed URL would break: SCORM packages loaded by an LMS,
 * certificate QR code images in PDFs, Open Badge assertion images, etc.
 *
 * Requires the bucket/object to be publicly readable (e.g. R2 public bucket or
 * a custom domain with public access). If AWS_S3_PUBLIC_URL is not set, falls
 * back to a pre-signed URL — fine for authenticated internal use, but the URL
 * will expire.
 */
export async function publicFileUrl(key: string): Promise<string> {
  const publicBase = process.env.AWS_S3_PUBLIC_URL;
  if (publicBase) {
    return `${publicBase.replace(/\/$/, "")}/${key}`;
  }
  return getFileUrl(key);
}

// ─── Read a local file (for the download proxy route) ─────────────────────────

export async function readLocalFile(key: string): Promise<Buffer> {
  const uploadRoot = path.resolve(process.cwd(), "private-uploads");
  const filePath = path.resolve(uploadRoot, key);

  // CWE-22: ensure resolved path stays within the upload root
  if (!filePath.startsWith(uploadRoot + path.sep)) {
    throw new Error("Path traversal detected in file key");
  }

  return readFile(filePath);
}

// ─── Delete a file ────────────────────────────────────────────────────────────

export async function deleteFile(key: string): Promise<void> {
  const provider = process.env.STORAGE_PROVIDER ?? "local";

  if (provider === "s3") {
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await makeS3Client();
    await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
    return;
  }

  const uploadRoot = path.resolve(process.cwd(), "private-uploads");
  const filePath = path.resolve(uploadRoot, key);
  if (!filePath.startsWith(uploadRoot + path.sep)) {
    throw new Error("Path traversal detected in file key");
  }
  await unlink(filePath).catch(() => {});
}
