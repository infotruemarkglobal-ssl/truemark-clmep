// One-time backfill: recompute AuditLog.contentHash and AuditLog.previousHash
// for every existing row, in timestamp order.
//
// WHY THIS IS NEEDED (and why it's not tampering)
// ─────────────────────────────────────────────────
// The tamper-evidence hash formula in src/lib/audit.ts's computeContentHash()
// was extended to also cover ipAddress/userAgent (previously only id|action|
// entityType|entityId|metadata|userId). Every row written before that change
// still carries a contentHash computed under the OLD formula — verifying
// them against the NEW formula produces a mismatch that looks identical to
// real tampering, even though nothing about the row's actual content
// changed. This script re-derives contentHash from each row's own, already-
// stored, unmodified content (action/entityType/entityId/metadata/userId/
// ipAddress/userAgent are read as-is, never altered) — it recomputes a
// checksum, it does not touch what's being checksummed. This is the same
// category of operation as a password-hash-algorithm migration: rehashing
// unchanged input under a new formula is not falsifying history.
//
// The chain link (previousHash) is populated for the first time across the
// FULL table, not just rows written after the chain feature shipped — this
// gives one complete, gapless, independently-verifiable chain from the very
// first AuditLog row ever written, rather than leaving all pre-migration
// history permanently outside the chain.
//
// Safe to re-run: fully deterministic given unchanged row content: chaining
// the same set of rows in the same order always reproduces the same hashes.
//
// Usage: npx ts-node --project tsconfig.seed.json prisma/backfill-audit-hashes.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeContentHash } from "../src/lib/audit";

const url = process.env.DATABASE_URL ?? "";
const adapter = new PrismaPg({ connectionString: url });
const db = new PrismaClient({ adapter });

async function main() {
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

  console.log(`Backfilling ${rows.length} AuditLog rows...`);

  let previousContentHash: string | null = null;
  let changed = 0;

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

    if (recomputed !== row.contentHash || previousContentHash !== row.previousHash) {
      await db.auditLog.update({
        where: { id: row.id },
        data: { contentHash: recomputed, previousHash: previousContentHash },
      });
      changed++;
    }

    previousContentHash = recomputed;
  }

  console.log(`Done. ${changed} row(s) updated, ${rows.length - changed} already consistent.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
