import { db } from "@/lib/db";
import { computeContentHash } from "@/lib/audit";
import { extractAttestedDigest } from "@/lib/timestamp-anchor";

export type ChainVerificationResult = {
  totalRows: number;
  hashMismatches: string[]; // row ids whose stored contentHash doesn't match its own content
  chainBreaks: string[]; // row ids whose previousHash doesn't match the preceding row's contentHash
  legacyRowCount: number; // rows from before chaining shipped (previousHash null, legitimately)
  intact: boolean;
};

/**
 * Walks the entire AuditLog table in write order and checks two independent
 * things: (1) every row's own contentHash still matches its content
 * (detects in-place edits — pre-existing per-row tamper evidence), and (2)
 * every row's previousHash matches the contentHash of the row immediately
 * before it (detects a row being deleted outright, which per-row hashing
 * alone cannot catch).
 *
 * Every row written before chaining shipped legitimately has
 * previousHash = null — that can be an arbitrarily long PREFIX of the
 * table, not just one row. auditLog() always looks up the live tip's
 * contentHash on every write, so the very first row written after
 * deployment already gets a real (non-null) previousHash; a null
 * previousHash can therefore only be legitimate while walking that leading
 * prefix. Once the first non-null previousHash is seen, chaining is
 * considered active — any null previousHash after that point is a real
 * anomaly, not legacy data, and is flagged as a break.
 */
export async function verifyAuditChain(): Promise<ChainVerificationResult> {
  const rows = await db.auditLog.findMany({
    orderBy: { timestamp: "asc" },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      metadata: true,
      userId: true,
      ipAddress: true,
      userAgent: true,
      contentHash: true,
      previousHash: true,
    },
  });
  return verifyChainRows(rows);
}

type ChainRow = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  contentHash: string | null;
  previousHash: string | null;
};

/**
 * The pure walk-and-check logic, separated from the DB read so it can be
 * exercised against synthetic rows in tests without ever touching the real
 * (append-only, must-never-be-mutated) audit_logs table.
 */
export function verifyChainRows(rows: ChainRow[]): ChainVerificationResult {
  const hashMismatches: string[] = [];
  const chainBreaks: string[] = [];
  let legacyRowCount = 0;
  let chainActive = false;
  let previousContentHash: string | null = null;

  for (const row of rows) {
    const recomputed = computeContentHash({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      userId: row.userId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    });
    if (recomputed !== row.contentHash) hashMismatches.push(row.id);

    if (!chainActive && row.previousHash === null) {
      // Still in the legitimate leading prefix of pre-chaining history.
      legacyRowCount++;
    } else {
      chainActive = true;
      if (row.previousHash !== previousContentHash) chainBreaks.push(row.id);
    }

    previousContentHash = row.contentHash;
  }

  return {
    totalRows: rows.length,
    hashMismatches,
    chainBreaks,
    legacyRowCount,
    intact: hashMismatches.length === 0 && chainBreaks.length === 0,
  };
}

export type AnchorVerificationResult = {
  anchorId: string;
  valid: boolean;
  reason?: string;
  genTime?: string;
};

/** Independently re-verifies one stored AuditAnchor's RFC 3161 response. */
export async function verifyAnchor(anchorId: string): Promise<AnchorVerificationResult> {
  const anchor = await db.auditAnchor.findUnique({ where: { id: anchorId } });
  if (!anchor) return { anchorId, valid: false, reason: "Anchor not found" };

  try {
    const attested = extractAttestedDigest(anchor.tsaResponse);
    if (attested.messageDigest !== anchor.digestHash) {
      return { anchorId, valid: false, reason: "Stored response's attested digest does not match the recorded digestHash" };
    }
    if (attested.genTime.getTime() !== anchor.tsaGenTime.getTime()) {
      return { anchorId, valid: false, reason: "Stored response's genTime does not match the recorded tsaGenTime" };
    }
    return { anchorId, valid: true, genTime: attested.genTime.toISOString() };
  } catch (err) {
    return { anchorId, valid: false, reason: err instanceof Error ? err.message : "Failed to parse stored response" };
  }
}
