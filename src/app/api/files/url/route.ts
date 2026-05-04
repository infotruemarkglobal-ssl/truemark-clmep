/**
 * GET /api/files/url?key=<storage-key>
 *
 * Auth-gated file access proxy.
 *
 * SECURITY
 * ════════
 * • Requires an active session — unauthenticated requests receive 401.
 * • For S3: returns a 302 redirect to a freshly-generated pre-signed URL
 *   (15-minute expiry). The pre-signed URL is single-use by design —
 *   forwarding it does not grant indefinite access.
 * • For local storage: streams the file bytes directly (private-uploads/,
 *   which is not under public/ and is never served statically by Next.js).
 * • CWE-22: path traversal on the `key` parameter is blocked inside
 *   getFileUrl() / readLocalFile() which resolve the path and check it
 *   stays within the upload root.
 *
 * IDOR NOTE
 * ═════════
 * This endpoint only verifies that the requester is authenticated, not that
 * they have permission for this specific file. For course materials this is
 * appropriate — any enrolled user may access course content. If you later
 * add user-generated uploads that must be private (e.g. personal documents),
 * extend this route to check ownership against a DB record.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFileUrl, readLocalFile } from "@/lib/storage";
import { lookup as mimeTypeLookup } from "mime-types";
import path from "path";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key || key.trim() === "") {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  // CWE-22: reject obviously malicious keys early (path traversal sequences)
  if (key.includes("..") || key.includes("\0")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const provider = process.env.STORAGE_PROVIDER ?? "local";

  if (provider === "s3") {
    // Generate a fresh pre-signed URL and redirect.
    // The 302 keeps the URL out of server logs while the browser follows it.
    try {
      const signedUrl = await getFileUrl(key);
      return NextResponse.redirect(signedUrl, { status: 302 });
    } catch {
      return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
    }
  }

  // Local: stream from private-uploads/ (not served statically)
  try {
    const buffer = await readLocalFile(key);
    const contentType = mimeTypeLookup(path.extname(key)) || "application/octet-stream";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        // Prevent the browser from sniffing a different MIME type
        "X-Content-Type-Options": "nosniff",
        // Do not cache — each request goes through auth check
        "Cache-Control": "private, no-store",
        // Tell browser to download instead of execute (defence-in-depth for
        // HTML/SVG/JS files that could run in the browser context)
        "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(key))}"`,
      },
    });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
