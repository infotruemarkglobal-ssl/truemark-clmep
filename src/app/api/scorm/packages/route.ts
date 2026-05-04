import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";
import { inngest, EVENTS } from "@/inngest/client";
import { XMLParser } from "fast-xml-parser";
import { uploadFile } from "@/lib/storage";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.TRAINER];

/**
 * Sanitize the launchUrl extracted from imsmanifest.xml.
 *
 * A crafted manifest could specify a launch URL such as:
 *   javascript:alert(1)          → XSS via the iframe src attribute
 *   //evil.com/steal-cookies     → protocol-relative redirect to an attacker host
 *   ../../../etc/passwd          → path traversal (less relevant for iframe src but
 *                                   still confusing to Next.js routing)
 *   /absolute/path               → escapes the /scorm-content/{id}/ prefix
 *
 * We require a relative path containing only URL-safe characters.
 * Returns null if the value is unsafe; the caller falls back to "index.html".
 */
function sanitizeLaunchUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Reject absolute URLs (contain a scheme like "http:" or "javascript:")
  // and protocol-relative references ("//...").
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(trimmed) || trimmed.startsWith("//")) {
    return null;
  }

  // Reject leading slash — must be relative, not root-relative.
  if (trimmed.startsWith("/")) return null;

  // Reject directory traversal sequences.
  if (trimmed.includes("../") || trimmed.includes("..\\") || trimmed === "..") {
    return null;
  }

  // Allow only the characters that appear in normal relative URLs.
  // This covers paths, query strings, and fragment identifiers.
  if (!/^[\w\-./%?=&#]+$/.test(trimmed)) return null;

  return trimmed;
}

/** Parse imsmanifest.xml and extract SCORM version + launch URL */
function parseManifest(xml: string): { version: string; launchUrl: string; title: string } {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml);

  const manifest = doc?.manifest ?? doc;

  // Detect SCORM version from schemaversion or metadata
  let version = "1.2";
  const schemaVersion =
    manifest?.metadata?.schemaversion ??
    manifest?.metadata?.["adlcp:schemaversion"] ??
    "";
  if (String(schemaVersion).includes("2004") || String(schemaVersion).includes("1.3")) {
    version = "2004";
  }

  // Find first resource with href (the launch file)
  let launchUrl = "index.html";
  const resources = manifest?.resources?.resource;
  if (resources) {
    const resourceList = Array.isArray(resources) ? resources : [resources];
    // Find the first SCO (sharable content object)
    const sco = resourceList.find(
      (r: Record<string, string>) =>
        r["@_type"]?.toLowerCase().includes("sco") ||
        r["@_adlcp:scormtype"]?.toLowerCase() === "sco" ||
        r["@_adlcp:scormType"]?.toLowerCase() === "sco"
    ) ?? resourceList[0];
    if (sco?.["@_href"]) {
      const safe = sanitizeLaunchUrl(String(sco["@_href"]));
      if (safe) launchUrl = safe;
    }
  }

  // Extract title from organizations
  let title = "SCORM Package";
  try {
    const org =
      manifest?.organizations?.organization ??
      manifest?.organizations?.organization?.[0];
    const t = Array.isArray(org) ? org[0]?.title : org?.title;
    if (t) title = String(t);
  } catch {}

  return { version, launchUrl, title };
}

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

// Vercel Pro required for maxDuration > 10.
// In-memory ZIP extraction + uploading all entries to R2 can take 30–45s.
// See: https://vercel.com/docs/functions/runtimes#max-duration
export const maxDuration = 60; // seconds

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const lessonId = formData.get("lessonId") as string | null;

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > 500 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 500 MB)" }, { status: 400 });
  }

  // Validate lessonId if provided
  if (lessonId) {
    const lesson = await db.courseLesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: { select: { creatorId: true } } } } },
    });
    if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    if (lesson.contentType !== "scorm") {
      return NextResponse.json({ error: "Lesson content type must be 'scorm'" }, { status: 400 });
    }
    // L5: TRAINERs may only attach SCORM to lessons in courses they own.
    if (session.user.role === USER_ROLES.TRAINER && lesson.module.course.creatorId !== session.user.id) {
      return NextResponse.json({ error: "You can only upload SCORM packages to your own courses" }, { status: 403 });
    }
    // Check if a package already exists for this lesson
    const existing = await db.sCORMPackage.findUnique({ where: { lessonId } });
    if (existing) {
      return NextResponse.json({ error: "A SCORM package is already linked to this lesson. Delete it first." }, { status: 409 });
    }
  }

  // Read zip into buffer
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // A03:2021 — validate by magic bytes; never trust Content-Type or extension alone.
  // ZIP magic bytes: PK\x03\x04 (local file header signature)
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 || // P
    buffer[1] !== 0x4B || // K
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return NextResponse.json({ error: "File is not a valid ZIP archive" }, { status: 400 });
  }

  // Dynamic import — adm-zip is a Node-only module listed in serverExternalPackages;
  // importing dynamically keeps it out of the module graph until needed.
  const AdmZip = (await import("adm-zip")).default;
  let zip: InstanceType<typeof AdmZip>;
  try {
    zip = new AdmZip(buffer);
  } catch {
    return NextResponse.json({ error: "Invalid or corrupted zip file" }, { status: 400 });
  }

  // Find imsmanifest.xml
  const manifestEntry = zip.getEntries().find(
    (e) => e.entryName === "imsmanifest.xml" || e.entryName.endsWith("/imsmanifest.xml")
  );
  if (!manifestEntry) {
    return NextResponse.json({ error: "Not a valid SCORM package — imsmanifest.xml not found" }, { status: 400 });
  }

  const manifestXml = manifestEntry.getData().toString("utf-8");
  let parsed: { version: string; launchUrl: string; title: string };
  try {
    parsed = parseManifest(manifestXml);
  } catch {
    return NextResponse.json({ error: "Failed to parse imsmanifest.xml" }, { status: 400 });
  }

  // Create DB record first to get the package ID
  const pkg = await db.sCORMPackage.create({
    data: {
      lessonId: lessonId ?? null,
      title: parsed.title,
      version: parsed.version,
      launchUrl: parsed.launchUrl,
      packagePath: "", // filled after R2 upload below
      manifestRaw: manifestXml,
      createdBy: session.user.id,
    },
  });

  const r2Prefix = `scorm-content/${pkg.id}`;

  // ── CWE-22 (Zip-Slip) ────────────────────────────────────────────────────────
  // Validate ALL entry paths before writing a single byte to R2.
  // String-based check — no filesystem path resolution required.
  // Normalise backslashes so Windows-generated ZIPs are handled consistently.
  const entries = zip.getEntries();
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, "/");
    const parts = name.split("/");
    if (parts.some((p) => p === "..") || name.startsWith("/") || name.includes("\0")) {
      await db.sCORMPackage.delete({ where: { id: pkg.id } });
      return NextResponse.json(
        { error: "Invalid SCORM package: path traversal detected in zip entry" },
        { status: 400 },
      );
    }
  }

  // ── Upload each ZIP entry to R2 (or local private-uploads in dev) ────────────
  // Directory-only entries (trailing "/") are skipped — R2 has no concept of
  // empty directories; only the files themselves need to be uploaded.
  // Uploads are sequential rather than batched with Promise.all to cap memory
  // usage on Lambda for packages with many files.
  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryPath = entry.entryName.replace(/\\/g, "/");
    const key = `${r2Prefix}/${entryPath}`;
    const contentType = mimeTypeFromExt(entryPath);
    const data = entry.getData();

    await uploadFile({ buffer: data, key, contentType }).catch(async (err) => {
      await db.sCORMPackage.delete({ where: { id: pkg.id } }).catch(() => {});
      throw err;
    });
  }

  // Upload the raw ZIP to quarantine so the Inngest malware scanner can inspect it.
  // The extracted files are already in scorm-content/ above — this is for scanning only.
  const quarantineKey = `quarantine/${pkg.id}/package.zip`;
  await uploadFile({ buffer, key: quarantineKey, contentType: "application/zip" }).catch(
    (err) => console.error("[scorm-upload] Failed to upload ZIP to quarantine:", err),
  );

  // Persist the R2 prefix now that all files are uploaded successfully
  await db.sCORMPackage.update({
    where: { id: pkg.id },
    data: { packagePath: r2Prefix },
  });

  await auditLog({
    userId: session.user.id,
    action: "SCORM_PACKAGE_UPLOADED",
    entityType: "SCORMPackage",
    entityId: pkg.id,
    metadata: { title: parsed.title, version: parsed.version, launchUrl: parsed.launchUrl },
  });

  // Fire async malware scan against the quarantine ZIP
  await inngest.send({
    name: EVENTS.SCAN_UPLOAD,
    data: {
      key: quarantineKey,
      uploadedBy: session.user.id,
      provider: process.env.STORAGE_PROVIDER ?? "local",
      sizeBytes: file.size,
      contentType: "application/zip",
    },
  }).catch((err) => console.error("[scorm-upload] Failed to enqueue malware scan:", err));

  return NextResponse.json({
    id: pkg.id,
    title: parsed.title,
    version: parsed.version,
    launchUrl: parsed.launchUrl,
    lessonId: pkg.lessonId,
  }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // L6: TRAINERs see only packages they created; admins/officers see all.
  const ownerFilter = session.user.role === USER_ROLES.TRAINER
    ? { createdBy: session.user.id }
    : {};

  const packages = await db.sCORMPackage.findMany({
    where: ownerFilter,
    orderBy: { createdAt: "desc" },
    include: {
      lesson: { select: { title: true, module: { select: { course: { select: { title: true } } } } } },
      _count: { select: { sessions: true } },
    },
  });

  return NextResponse.json(packages);
}
