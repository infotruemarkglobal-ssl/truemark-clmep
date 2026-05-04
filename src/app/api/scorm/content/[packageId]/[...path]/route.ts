import { NextRequest, NextResponse } from "next/server";

// Permissive CSP for SCORM content.
// SCORM packages are third-party content that routinely uses inline scripts and
// eval() — both required by the SCORM 1.2/2004 runtime and impossible to nonce.
// Scope is limited to this route; the parent player page (/scorm/player/*)
// remains under the strict nonce-based CSP set by middleware.
const SCORM_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  // Only allow framing by same-origin pages (the SCORM player iframe)
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

// Vercel Pro required for maxDuration > 10.
// Large SCORM media files (MP4, PDF) may take several seconds to proxy from R2.
// See: https://vercel.com/docs/functions/runtimes#max-duration
export const maxDuration = 30; // seconds

/** Derive a Content-Type from a file's extension. */
function mimeTypeFromExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  const map: Record<string, string> = {
    ".html": "text/html",
    ".htm": "text/html",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".xml": "application/xml",
    ".xsd": "application/xml",
    ".dtd": "application/xml-dtd",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".swf": "application/x-shockwave-flash",
    ".zip": "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}

const SCORM_HEADERS = {
  "Content-Security-Policy": SCORM_CSP,
  // Allow this content to be loaded in the same-origin SCORM player iframe.
  "X-Frame-Options": "SAMEORIGIN",
  // SCORM files are immutable once uploaded — safe to cache for an hour.
  "Cache-Control": "public, max-age=3600",
} as const;

// No authentication required — SCORM runtime makes XHR calls from within
// iframes. The iframe sandbox includes allow-same-origin which passes session
// cookies, but we cannot guarantee the learner's auth state on every sub-resource
// fetch. Content is keyed by opaque package ID (cuid) which is unguessable.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ packageId: string; path: string[] }> }
) {
  const { packageId, path } = await params;

  // Reconstruct the entry path from the catch-all segments.
  // Next.js URL-decodes each segment; re-joining with "/" is safe.
  const entryPath = path.join("/");
  const key = `scorm-content/${packageId}/${entryPath}`;

  // ── Local dev (STORAGE_PROVIDER=local) ──────────────────────────────────────
  if ((process.env.STORAGE_PROVIDER ?? "local") === "local") {
    const { readLocalFile } = await import("@/lib/storage");
    let data: Buffer;
    try {
      data = await readLocalFile(key);
    } catch {
      return new Response(null, { status: 404 });
    }

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeTypeFromExt(entryPath),
        ...SCORM_HEADERS,
      },
    });
  }

  // ── S3 / Cloudflare R2 ───────────────────────────────────────────────────────
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { makeS3Client } = await import("@/lib/storage");

    const s3 = await makeS3Client();
    const bucket = process.env.AWS_S3_BUCKET ?? "";

    const resp = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    if (!resp.Body) return new Response(null, { status: 404 });

    // Consume the SDK stream into a Buffer.
    // Using AsyncIterable is the most compatible approach across SDK versions.
    const chunks: Uint8Array[] = [];
    for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);

    // Use the ContentType stored at upload time; fall back to extension-based inference.
    const contentType = resp.ContentType ?? mimeTypeFromExt(entryPath);

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        ...SCORM_HEADERS,
      },
    });
  } catch (err: unknown) {
    const code =
      (err as { Code?: string }).Code ??
      (err as { name?: string }).name;
    if (code === "NoSuchKey" || code === "NotFound") {
      return new Response(null, { status: 404 });
    }
    console.error("[scorm-content] Error fetching from R2:", err);
    return new Response(null, { status: 500 });
  }
}
