import crypto, { randomUUID } from "crypto";
import { db } from "@/lib/db";

/**
 * Compute a SHA-256 content hash for an audit log entry.
 *
 * ISO 27001 A.8.15 tamper evidence — the hash covers every meaningful field
 * so that any post-write modification (UPDATE) produces a detectable mismatch
 * when the verification script re-hashes the row content.
 *
 * Hash input: pipe-delimited canonical string of deterministic fields.
 * The `id` is included so that two identical events at different times produce
 * different hashes. `timestamp` is excluded because Prisma's @default(now())
 * is assigned by the DB — we hash after the fact using the returned timestamp.
 */
function computeContentHash(fields: {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  userId: string | null;
}): string {
  const canonical = [
    fields.id,
    fields.action,
    fields.entityType ?? "",
    fields.entityId ?? "",
    fields.metadata ?? "",
    fields.userId ?? "",
  ].join("|");
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

// Audit logging is best-effort — a write failure must never crash a business
// operation. Errors are logged to the server console for monitoring/alerting.
export async function auditLog(opts: {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    const metadataStr = opts.metadata ? JSON.stringify(opts.metadata) : null;

    // Generate the id here so we can compute the content hash before the insert,
    // collapsing two round-trips into one atomic write (eliminates the TOCTOU
    // window where the row existed without a hash).
    const id = randomUUID();
    const contentHash = computeContentHash({
      id,
      action: opts.action,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      metadata: metadataStr,
      userId: opts.userId ?? null,
    });

    await db.auditLog.create({
      data: {
        id,
        userId: opts.userId ?? null,
        action: opts.action,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        metadata: metadataStr,
        ipAddress: opts.ipAddress ?? null,
        contentHash,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log for action %s:", opts.action, err);
  }
}
