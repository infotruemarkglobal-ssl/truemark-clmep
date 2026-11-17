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
export function computeContentHash(fields: {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}): string {
  const canonical = [
    fields.id,
    fields.action,
    fields.entityType ?? "",
    fields.entityId ?? "",
    fields.metadata ?? "",
    fields.userId ?? "",
    fields.ipAddress ?? "",
    fields.userAgent ?? "",
  ].join("|");
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

type AuditLogOpts = {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

// The subset of the Prisma client this needs from a transaction — either the
// top-level `db` or a `tx` handed in by a caller's own db.$transaction(async
// (tx) => ...) callback. Kept minimal (not Prisma.TransactionClient, which
// this Prisma version types as `any`) so callers get real autocomplete/type
// checking on what's actually used here.
type AuditLogDb = {
  $executeRaw: typeof db.$executeRaw;
  auditLog: Pick<typeof db.auditLog, "findFirst" | "create">;
};

/**
 * Core hash-and-chain write, usable either standalone (auditLog(), which
 * opens its own transaction) or composed into a caller's own transaction
 * (auditLogInTx()) so the audit row can be genuinely atomic with the
 * business write it documents — e.g. a certificate revocation and its audit
 * entry either both commit or both roll back together.
 *
 * Both entry points acquire the same advisory-lock key before reading the
 * chain tip, so concurrent writers (whether standalone or inside their own
 * transaction) never race to link to the same previousHash.
 */
async function writeAuditLogEntry(tx: AuditLogDb, opts: AuditLogOpts): Promise<void> {
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
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
  });

  // Serialize all concurrent audit-log writes on a fixed advisory-lock key
  // so "the current chain tip" is unambiguous — without this, two
  // concurrent writers could both read the same latest row and link to the
  // same previousHash, silently forking the chain. Transaction-scoped:
  // released automatically on commit/rollback of whichever transaction
  // (ours or the caller's) this runs inside.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(727270001)`;

  const tip = await tx.auditLog.findFirst({
    orderBy: { timestamp: "desc" },
    select: { contentHash: true },
  });

  await tx.auditLog.create({
    data: {
      id,
      userId: opts.userId ?? null,
      action: opts.action,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      metadata: metadataStr,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
      contentHash,
      previousHash: tip?.contentHash ?? null,
    },
  });
}

// Audit logging is best-effort — a write failure must never crash a business
// operation. Errors are logged to the server console for monitoring/alerting.
export async function auditLog(opts: AuditLogOpts): Promise<void> {
  try {
    await db.$transaction(
      (tx) => writeAuditLogEntry(tx, opts),
      // Several call sites fire multiple auditLog() calls back-to-back for
      // one business operation (e.g. a bulk-enrolment loop) — each opens its
      // own transaction and queues on the same advisory lock. Prisma's
      // default 5s maxWait-to-acquire-a-connection is too tight once several
      // of these are queued; widen it so a burst degrades to "briefly
      // slower," not "audit rows silently dropped" (still best-effort/caught
      // below if it genuinely can't complete).
      { maxWait: 15_000, timeout: 15_000 },
    );
  } catch (err) {
    console.error("[audit] Failed to write audit log for action %s:", opts.action, err);
  }
}

/**
 * Same as auditLog(), but writes inside a transaction the CALLER already
 * has open (their own db.$transaction(async (tx) => {...}) callback) so the
 * audit entry commits or rolls back atomically with whatever business
 * operation it documents. Use this instead of a raw tx.auditLog.create(...)
 * call — a raw create skips both the content hash and the chain link
 * entirely, leaving that event permanently outside the tamper-evidence
 * system. NOT best-effort like auditLog() — a failure here is a failure of
 * the caller's own transaction (matching the same all-or-nothing guarantee
 * the caller was already relying on when they used to inline the raw
 * create() into their transaction array).
 */
export async function auditLogInTx(tx: AuditLogDb, opts: AuditLogOpts): Promise<void> {
  await writeAuditLogEntry(tx, opts);
}

export type PreparedAuditEntry = {
  id: string;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  contentHash: string;
  previousHash: string | null;
};

/**
 * For call sites that combine a business write with an audit entry inside
 * an ARRAY-form db.$transaction([...]) — several routes in this codebase
 * deliberately use array form over the interactive callback form because it
 * is the pattern proven safe against Supabase's PgBouncer transaction-mode
 * pooling in production (see the comment in
 * src/app/api/payments/paystack/webhook/route.ts). Array form can't run a
 * dependent read-then-write sequence as one of its elements, so the
 * lock+read+hash step this module otherwise does inline has to happen in
 * its own short transaction just before — the exact same shape auditLog()
 * itself already uses, just returning the row data instead of writing it.
 * The caller includes `db.auditLog.create({ data: <result> })` as one
 * element of their own array.
 *
 * This does narrow (not eliminate) the race window auditLog()'s single
 * transaction closes: another writer could claim the same chain tip between
 * this call returning and the caller's array-transaction committing. Given
 * every current use of this is a low-frequency, non-hot-path event (a
 * payment webhook, a certificate renewal, a GDPR fulfilment, a role change),
 * that narrow window is an accepted, deliberate trade-off against forcing
 * these routes onto a transaction pattern this codebase has already found
 * unsafe in production — not an oversight.
 */
export async function prepareAuditEntry(opts: AuditLogOpts): Promise<PreparedAuditEntry> {
  const metadataStr = opts.metadata ? JSON.stringify(opts.metadata) : null;
  const id = randomUUID();
  const contentHash = computeContentHash({
    id,
    action: opts.action,
    entityType: opts.entityType ?? null,
    entityId: opts.entityId ?? null,
    metadata: metadataStr,
    userId: opts.userId ?? null,
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
  });

  const previousHash = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(727270001)`;
      const tip = await tx.auditLog.findFirst({
        orderBy: { timestamp: "desc" },
        select: { contentHash: true },
      });
      return tip?.contentHash ?? null;
    },
    { maxWait: 15_000, timeout: 15_000 },
  );

  return {
    id,
    userId: opts.userId ?? null,
    action: opts.action,
    entityType: opts.entityType ?? null,
    entityId: opts.entityId ?? null,
    metadata: metadataStr,
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
    contentHash,
    previousHash,
  };
}
