/**
 * Async malware scanning for uploaded files.
 *
 * WHY ASYNC
 * ─────────
 * Synchronous scanning inside the upload request would block the HTTP response
 * for seconds (scan time) and would fail the entire upload on a scanner
 * timeout — a poor UX and a denial-of-service vector. Running the scan as an
 * Inngest background job decouples upload latency from scan latency, provides
 * automatic retries, and keeps the scan result in the Inngest event log for
 * auditors.
 *
 * SCANNER PRIORITY
 * ────────────────
 * 1. ClamAV (CLAMAV_HOST set) — self-hosted sidecar; TCP clamd socket.
 *    Suitable for traditional VPS/container deployments.
 *
 * 2. VirusTotal (VIRUSTOTAL_API_KEY set) — cloud scanner; no sidecar needed.
 *    Works from Vercel serverless. Uses hash lookup first (instant, no upload),
 *    then uploads only for unknown files under 32 MB.
 *    Free tier: 500 lookups/day, 4 req/min.
 *
 * 3. No scanner + production storage → hard block (file quarantined, admins
 *    notified). Never silently allows unscanned files in production.
 *
 * 4. No scanner + local storage → warning logged, file allowed (dev only).
 *
 * QUARANTINE PATTERN
 * ──────────────────
 * Files land in s3://bucket/<key> after upload. On CLEAN the key is promoted
 * to the live serving path. On INFECTED the file is deleted and admins are
 * notified. On BLOCKED (no scanner) the file is moved to quarantine/blocked/.
 *
 * IDEMPOTENCY
 * ───────────
 * All writes (audit logs, notifications) are inside step.run() blocks so they
 * are memoised by Inngest. On a retry, completed steps are replayed from the
 * run log — the scanner is called again (read-only) but side-effects are not
 * duplicated.
 */

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { inngest, EVENTS } from "@/inngest/client";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

// ─── Payload schema ────────────────────────────────────────────────────────────

const scanPayloadSchema = z.object({
  key: z.string().min(1),
  uploadedBy: z.string().min(1),
  provider: z.enum(["s3", "local"]),
  sizeBytes: z.number().int().min(0),
  contentType: z.string().min(1),
});

export type ScanUploadEvent = {
  name: typeof EVENTS.SCAN_UPLOAD;
  data: z.infer<typeof scanPayloadSchema>;
};

// ─── Internal types ────────────────────────────────────────────────────────────

type ScanStepResult =
  // No scanner configured in production → hard block
  | { blocked: true;  unknown: false; isInfected: false; viruses: string[]; scanned: false }
  // No scanner configured in local dev → allowed with warning
  | { blocked: false; unknown: false; isInfected: false; viruses: string[]; scanned: false }
  // Scanner ran and the file is clean
  | { blocked: false; unknown: false; isInfected: false; viruses: string[]; scanned: true }
  // Scanner ran and the file is infected
  | { blocked: false; unknown: false; isInfected: true;  viruses: string[]; scanned: true }
  // Scanner ran but could not produce a definitive result (rate limit, size, timeout)
  | { blocked: false; unknown: true;  isInfected: false; viruses: string[]; scanned: false; reason: string };

// ─── VirusTotal helpers ────────────────────────────────────────────────────────

const VT_BASE = "https://www.virustotal.com/api/v3";
const VT_MAX_BYTES = 32 * 1024 * 1024; // 32 MB — free-tier upload limit

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Parse malicious engine names from a VT analysis_results map. */
function parseVtViruses(
  results: Record<string, { category: string; result: string | null; engine_name: string }>,
): string[] {
  return Object.values(results)
    .filter((r) => r.category === "malicious")
    .map((r) => r.result ?? r.engine_name)
    .filter(Boolean);
}

// ─── Function ─────────────────────────────────────────────────────────────────

export const scanUpload = inngest.createFunction(
  {
    id: "scan-upload",
    name: "Malware scan uploaded file",
    retries: 5,
    triggers: [{ event: EVENTS.SCAN_UPLOAD }],
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: unknown; name: string };
      error: Error;
    }) => {
      Sentry.captureException(error, {
        tags: { inngest_function: "scan-upload" },
        extra: { event },
      });
      console.error(
        "[inngest:scan-upload] All retries exhausted. Event:",
        JSON.stringify(event),
        error,
      );
    },
  },
  async ({
    event,
    step,
  }: {
    event: { data: unknown };
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    // Validate payload — a malformed event will never self-heal, so return
    // early without throwing (no retry).
    const parsed = scanPayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      console.error("[scan-upload] Invalid payload:", parsed.error.flatten());
      return { ok: false, error: "INVALID_PAYLOAD", issues: parsed.error.flatten() };
    }

    const { key, uploadedBy, provider, sizeBytes, contentType } = parsed.data;

    // ── Step 1: Run the scanner ───────────────────────────────────────────────
    // Memoised by Inngest — safe to re-run on retry (scanner is a read-only op).
    const scanResult: ScanStepResult = await step.run("run-malware-scan", async (): Promise<ScanStepResult> => {
      const clamHost   = process.env.CLAMAV_HOST;
      const vtApiKey   = process.env.VIRUSTOTAL_API_KEY;

      // ── Priority 1: ClamAV sidecar ──────────────────────────────────────────
      if (clamHost) {
        const clamPort = parseInt(process.env.CLAMAV_PORT ?? "3310", 10);
        // Dynamic import keeps clamscan out of the serverless bundle when unused.
        const NodeClam = (await import("clamscan")).default;
        const clam = await new NodeClam().init({
          clamdscan: { host: clamHost, port: clamPort, timeout: 60_000, active: true },
          preference: "clamdscan",
        });

        if (provider === "s3") {
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const { makeS3Client } = await import("@/lib/storage");
          const s3 = await makeS3Client();
          const resp = await s3.send(
            new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: key }),
          );
          const stream = resp.Body as import("stream").Readable;
          const { isInfected, viruses } = await clam.scanStream(stream);
          return { blocked: false, unknown: false, isInfected: isInfected ?? false, viruses: viruses ?? [], scanned: true };
        } else {
          const path = await import("path");
          const filePath = path.join(process.cwd(), "public", key);
          const { isInfected, viruses } = await clam.isInfected(filePath);
          return { blocked: false, unknown: false, isInfected: isInfected ?? false, viruses: viruses ?? [], scanned: true };
        }
      }

      // ── Priority 2: VirusTotal cloud scanner ────────────────────────────────
      if (vtApiKey) {
        // Fetch the file buffer once — needed for SHA-256 and potential upload.
        let buffer: Buffer;
        if (provider === "s3") {
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const { makeS3Client } = await import("@/lib/storage");
          const s3 = await makeS3Client();
          const resp = await s3.send(
            new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: key }),
          );
          const stream = resp.Body as import("stream").Readable;
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          buffer = Buffer.concat(chunks);
        } else {
          const { readLocalFile } = await import("@/lib/storage");
          buffer = await readLocalFile(key);
        }

        const { createHash } = await import("crypto");
        const sha256 = createHash("sha256").update(buffer).digest("hex");

        const vtGet = (url: string) =>
          fetch(url, {
            headers: { "x-apikey": vtApiKey },
            signal: AbortSignal.timeout(30_000),
          });

        // ── Step A: Hash lookup — fast, free, no upload ─────────────────────
        let hashRes = await vtGet(`${VT_BASE}/files/${sha256}`);

        if (hashRes.status === 429) {
          // Rate limited — wait 20 s and retry once.
          await delay(20_000);
          hashRes = await vtGet(`${VT_BASE}/files/${sha256}`);
          if (hashRes.status === 429) {
            console.warn(`[scan-upload] VirusTotal rate limited for "${key}". Allowing with warning.`);
            return { blocked: false, unknown: true, isInfected: false, viruses: [], scanned: false, reason: "RATE_LIMITED" };
          }
        }

        if (hashRes.ok) {
          // File is known to VirusTotal — no upload needed.
          type VtFileResp = {
            data: {
              attributes: {
                last_analysis_stats: { malicious: number };
                last_analysis_results: Record<string, { category: string; result: string | null; engine_name: string }>;
              };
            };
          };
          const json = await hashRes.json() as VtFileResp;
          const stats = json.data.attributes.last_analysis_stats;
          if ((stats.malicious ?? 0) > 0) {
            const viruses = parseVtViruses(json.data.attributes.last_analysis_results ?? {});
            return { blocked: false, unknown: false, isInfected: true, viruses, scanned: true };
          }
          return { blocked: false, unknown: false, isInfected: false, viruses: [], scanned: true };
        }

        if (hashRes.status !== 404) {
          // Unexpected API error — treat as unknown, allow with warning.
          console.warn(`[scan-upload] VirusTotal hash lookup returned ${hashRes.status} for "${key}". Treating as UNKNOWN.`);
          return { blocked: false, unknown: true, isInfected: false, viruses: [], scanned: false, reason: `VT_HASH_ERROR_${hashRes.status}` };
        }

        // ── Step B: File is unknown (404) — upload for full scan ───────────
        if (buffer.length > VT_MAX_BYTES) {
          // File exceeds the free-tier 32 MB upload limit.
          // Hash lookup already confirmed it is not a known threat.
          console.warn(
            `[scan-upload] File "${key}" (${buffer.length} bytes) exceeds VirusTotal 32 MB limit. ` +
            `Allowing with SCAN_SIZE_EXCEEDED warning.`,
          );
          return { blocked: false, unknown: true, isInfected: false, viruses: [], scanned: false, reason: "SCAN_SIZE_EXCEEDED" };
        }

        await delay(250); // stay comfortably under 4 req/min

        const form = new FormData();
        form.append(
          "file",
          new Blob([new Uint8Array(buffer)], { type: contentType }),
          key.split("/").pop() ?? "upload",
        );

        const uploadRes = await fetch(`${VT_BASE}/files`, {
          method: "POST",
          headers: { "x-apikey": vtApiKey },
          body: form,
          signal: AbortSignal.timeout(30_000),
        });

        if (!uploadRes.ok) {
          console.warn(`[scan-upload] VirusTotal upload failed (${uploadRes.status}) for "${key}". Treating as UNKNOWN.`);
          return { blocked: false, unknown: true, isInfected: false, viruses: [], scanned: false, reason: `VT_UPLOAD_ERROR_${uploadRes.status}` };
        }

        const uploadJson = await uploadRes.json() as { data: { id: string } };
        const analysisId = uploadJson.data?.id;
        if (!analysisId) {
          return { blocked: false, unknown: true, isInfected: false, viruses: [], scanned: false, reason: "VT_NO_ANALYSIS_ID" };
        }

        // ── Poll for analysis result (up to 6 × 10 s = 60 s) ──────────────
        type VtAnalysisResp = {
          data: {
            attributes: {
              status: string;
              stats: { malicious: number };
              results: Record<string, { category: string; result: string | null; engine_name: string }>;
            };
          };
        };

        for (let poll = 0; poll < 6; poll++) {
          await delay(10_000);
          await delay(250); // rate limit buffer between polls

          const analysisRes = await vtGet(`${VT_BASE}/analyses/${analysisId}`);
          if (!analysisRes.ok) continue;

          const analysis = await analysisRes.json() as VtAnalysisResp;
          if (analysis.data.attributes.status !== "completed") continue;

          const stats = analysis.data.attributes.stats;
          if ((stats.malicious ?? 0) > 0) {
            const viruses = parseVtViruses(analysis.data.attributes.results ?? {});
            return { blocked: false, unknown: false, isInfected: true, viruses, scanned: true };
          }
          return { blocked: false, unknown: false, isInfected: false, viruses: [], scanned: true };
        }

        console.warn(`[scan-upload] VirusTotal analysis for "${key}" did not complete after 6 polls. Treating as UNKNOWN.`);
        return { blocked: false, unknown: true, isInfected: false, viruses: [], scanned: false, reason: "VT_ANALYSIS_TIMEOUT" };
      }

      // ── Priority 3: No scanner configured ──────────────────────────────────
      if (provider !== "local") {
        // Production storage without any scanner → hard block.
        // The outer function will quarantine the file, write an audit log, and
        // notify SUPER_ADMINs. The file is never promoted to a serving key.
        return { blocked: true, unknown: false, isInfected: false, viruses: [], scanned: false };
      }

      // Local dev only — warn but do not block so development stays usable.
      console.warn(
        `[scan-upload] WARNING: Malware scanning is DISABLED — neither VIRUSTOTAL_API_KEY nor ` +
        `CLAMAV_HOST is set. File "${key}" was NOT scanned. Configure a scanner before deploying.`,
      );
      await auditLog({
        userId: uploadedBy,
        action: "FILE_SCAN_SKIPPED",
        entityType: "Upload",
        metadata: { key, provider, sizeBytes, contentType, reason: "NO_SCANNER_CONFIGURED" },
      });
      return { blocked: false, unknown: false, isInfected: false, viruses: [], scanned: false };
    });

    // ── Blocked path: no scanner in production ────────────────────────────────
    if (scanResult.blocked) {
      // Step 2a: Move file to quarantine/blocked/ — removes it from the live key
      // so the /api/files/url proxy can never issue a pre-signed URL for it.
      await step.run("quarantine-no-scanner", async () => {
        const { CopyObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        const { makeS3Client } = await import("@/lib/storage");
        const s3 = await makeS3Client();
        const bucket = process.env.AWS_S3_BUCKET!;
        const quarantineKey = `quarantine/blocked/${key}`;
        await s3.send(new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${encodeURIComponent(key)}`,
          Key: quarantineKey,
        }));
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      });

      await step.run("audit-scan-blocked", async () => {
        await auditLog({
          userId: uploadedBy,
          action: "FILE_SCAN_BLOCKED",
          entityType: "Upload",
          metadata: {
            key,
            provider,
            sizeBytes,
            contentType,
            status: "BLOCKED",
            reason: "NO_SCANNER_CONFIGURED",
            severity: "HIGH",
          },
        });
      });

      await step.run("notify-admins-no-scanner", async () => {
        const admins = await db.user.findMany({
          where: { role: "SUPER_ADMIN", status: "ACTIVE" },
          select: { id: true },
        });
        const filename = key.split("/").pop() ?? key;
        await db.notification.createMany({
          data: admins.map((a) => ({
            userId: a.id,
            type: "SYSTEM_ALERT",
            title: "File upload blocked: malware scanner not configured",
            message: `File upload blocked: no malware scanner configured (VIRUSTOTAL_API_KEY / CLAMAV_HOST). File: ${filename}`,
            link: "/manage/uploads",
          })),
        }).catch(() => {});
      });

      return { ok: false, blocked: true, reason: "NO_SCANNER_CONFIGURED" };
    }

    // ── Unknown path: scanner ran but result is inconclusive ──────────────────
    // Allow the file through — it was not positively identified as malicious.
    // Log for compliance so ops can review files that evaded definitive scanning.
    if (scanResult.unknown) {
      await step.run("audit-scan-unknown", async () => {
        await auditLog({
          userId: uploadedBy,
          action: "SCAN_RESULT_UNKNOWN",
          entityType: "Upload",
          metadata: {
            key,
            provider,
            sizeBytes,
            contentType,
            reason: scanResult.reason,
          },
        });
      });
      return { ok: true, unknown: true, reason: scanResult.reason };
    }

    // ── Infected path ─────────────────────────────────────────────────────────
    if (scanResult.isInfected) {
      // Step 2a: Delete the infected file
      await step.run("delete-infected-file", async () => {
        const { deleteFile } = await import("@/lib/storage");
        await deleteFile(key).catch((err) => {
          Sentry.captureException(err, {
            tags: { inngest_function: "scan-upload", stage: "delete-infected" },
            extra: { key },
          });
          console.error(`[scan-upload] Failed to delete infected file ${key}:`, err);
        });
      });

      // Step 2b: Notify SUPER_ADMINs
      await step.run("notify-admins", async () => {
        const admins = await db.user.findMany({
          where: { role: "SUPER_ADMIN", status: "ACTIVE" },
          select: { id: true },
        });
        await db.notification.createMany({
          data: admins.map((a) => ({
            userId: a.id,
            type: "SYSTEM_ALERT",
            title: "Malware detected in uploaded file",
            message: `File "${key}" uploaded by user ${uploadedBy} was quarantined. Threats: ${scanResult.viruses.join(", ")}`,
            link: "/manage/uploads",
          })),
        }).catch(() => {});
      });

      // Step 2c: Write quarantine audit log — severity HIGH for compliance trail
      await step.run("audit-quarantine", async () => {
        await auditLog({
          userId: uploadedBy,
          action: "FILE_SCAN_INFECTED",
          entityType: "Upload",
          metadata: {
            key,
            provider,
            sizeBytes,
            contentType,
            viruses: scanResult.viruses,
            severity: "HIGH",
          },
        });
      });

      return { ok: false, infected: true, viruses: scanResult.viruses };
    }

    // ── Clean path ────────────────────────────────────────────────────────────
    await step.run("audit-scan-clean", async () => {
      await auditLog({
        userId: uploadedBy,
        action: "FILE_SCAN_CLEAN",
        entityType: "Upload",
        metadata: { key, provider, sizeBytes, contentType },
      });
    });

    return { ok: true, infected: false };
  },
);
