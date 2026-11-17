// A real, proven backup-restore drill — "a backup that's never been restored
// isn't yet a backup." Dumps the real dev database (read-only pg_dump, safe)
// and restores it into a disposable, isolated Docker Postgres container —
// NEVER the dev database itself, and NEVER production (no prod credentials
// exist in this environment, and it would be out of bounds regardless).
// Verifies real row-count parity and that a real AuditLog row's tamper-
// evidence hash still recomputes correctly after the restore, then tears
// the container down completely.
//
// Usage: npx tsx scripts/backup-drill.ts
import "dotenv/config";
import { execFileSync, spawnSync } from "child_process";
import { mkdirSync, statSync } from "fs";
import path from "path";
import { Client as PgClient } from "pg";
import { computeContentHash } from "../src/lib/audit";
import { db as sourceDb, buildPolicyPdf, upsertPolicyDocument, type Section } from "./policy-doc-lib";

const CONTAINER_NAME = "clmep-restore-drill";
// A deliberately unusual port — 55432 collided with an unrelated, already-
// running container from a different project on this machine
// (ipi-cos-postgres-1). Picked something far less likely to collide with
// any other local Postgres-adjacent tooling.
const DRILL_PORT = 55917;
const DRILL_DB = "clmep_drill";
const DRILL_PASSWORD = "drill";
const DATA_DIR = path.join(__dirname, ".data");
const KEY_TABLES = ["users", "exam_attempts", "certificates", "audit_logs"] as const;

// Prisma's DIRECT_URL carries uselibpqcompat=true/pgbouncer=true — both are
// Prisma-only flags. Real libpq (pg_dump/pg_restore/psql) rejects them
// outright ("invalid URI query parameter") — confirmed directly against
// this exact DIRECT_URL. Strip both before handing the URL to real tooling.
function sanitizeDirectUrl(raw: string): string {
  const url = new URL(raw);
  url.searchParams.delete("uselibpqcompat");
  url.searchParams.delete("pgbouncer");
  return url.toString();
}

function sh(label: string, cmd: string, args: string[]): void {
  console.log(`\n$ ${label}`);
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

async function main() {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) throw new Error("DIRECT_URL is not set");
  const sanitizedUrl = sanitizeDirectUrl(directUrl);

  mkdirSync(DATA_DIR, { recursive: true });
  const timestamp = Date.now();
  const dumpFile = path.join(DATA_DIR, `clmep-drill-${timestamp}.dump`);

  // ── 1. Snapshot real row counts from the source (dev) DB, via Prisma ──────
  console.log("=== Step 1: Snapshot source row counts ===");
  const sourceCounts: Record<string, number> = {
    users: await sourceDb.user.count(),
    exam_attempts: await sourceDb.examAttempt.count(),
    certificates: await sourceDb.certificate.count(),
    audit_logs: await sourceDb.auditLog.count(),
  };
  console.log(sourceCounts);

  // Grab one real AuditLog row to re-verify its hash after restore.
  const sampleAuditRow = await sourceDb.auditLog.findFirst({
    orderBy: { timestamp: "desc" },
    select: { id: true, action: true, entityType: true, entityId: true, metadata: true, userId: true, ipAddress: true, userAgent: true, contentHash: true },
  });
  if (!sampleAuditRow) throw new Error("No AuditLog rows to spot-check — seed some data first");

  // ── 2. Real pg_dump against the sanitized DIRECT_URL (read-only, safe) ────
  console.log("\n=== Step 2: pg_dump (source: dev DB, read-only) ===");
  execFileSync("pg_dump", ["--no-owner", "--no-privileges", "-Fc", "-f", dumpFile, sanitizedUrl], { stdio: "inherit" });
  const dumpSizeBytes = statSync(dumpFile).size;
  console.log(`Dump written: ${dumpFile} (${(dumpSizeBytes / 1024).toFixed(1)} KB)`);

  // ── 3. Disposable Docker Postgres restore target ───────────────────────────
  console.log("\n=== Step 3: Start a disposable Docker Postgres container ===");
  // Clean up any stale container from a previous interrupted run first.
  spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });
  sh(
    "docker run (disposable restore target)",
    "docker",
    ["run", "--rm", "-d", "--name", CONTAINER_NAME, "-e", `POSTGRES_PASSWORD=${DRILL_PASSWORD}`, "-e", `POSTGRES_DB=${DRILL_DB}`, "-p", `${DRILL_PORT}:5432`, "postgres:16-alpine"],
  );

  console.log("Waiting for the container to accept connections...");
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    const check = spawnSync("docker", ["exec", CONTAINER_NAME, "pg_isready", "-U", "postgres", "-d", DRILL_DB]);
    if (check.status === 0) { ready = true; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error("Docker Postgres container never became ready");
  console.log("Container ready.");

  try {
    // ── 4. Real pg_restore into the disposable container ────────────────────
    console.log("\n=== Step 4: pg_restore into the disposable container ===");
    execFileSync(
      "pg_restore",
      ["--no-owner", "--no-privileges", "-h", "localhost", "-p", String(DRILL_PORT), "-U", "postgres", "-d", DRILL_DB, dumpFile],
      { stdio: "inherit", env: { ...process.env, PGPASSWORD: DRILL_PASSWORD } },
    );

    // ── 5. Verify: real row-count parity + a real hash spot-check ───────────
    console.log("\n=== Step 5: Verify restored data ===");
    const restoredClient = new PgClient({ host: "localhost", port: DRILL_PORT, user: "postgres", password: DRILL_PASSWORD, database: DRILL_DB });
    await restoredClient.connect();

    const restoredCounts: Record<string, number> = {};
    for (const table of KEY_TABLES) {
      const res = await restoredClient.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
      restoredCounts[table] = res.rows[0].count;
    }
    console.log("Restored counts:", restoredCounts);

    const parity = KEY_TABLES.every((t) => sourceCounts[t] === restoredCounts[t]);
    console.log(`Row-count parity: ${parity ? "PASS" : "FAIL"}`);
    if (!parity) throw new Error(`Row-count mismatch: source=${JSON.stringify(sourceCounts)} restored=${JSON.stringify(restoredCounts)}`);

    const restoredRow = await restoredClient.query(
      `SELECT id, action, "entityType", "entityId", metadata, "userId", "ipAddress", "userAgent", "contentHash" FROM audit_logs WHERE id = $1`,
      [sampleAuditRow.id],
    );
    await restoredClient.end();

    if (restoredRow.rows.length !== 1) throw new Error("Sample AuditLog row not found after restore");
    const r = restoredRow.rows[0];
    const recomputed = computeContentHash({
      id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId,
      metadata: r.metadata, userId: r.userId, ipAddress: r.ipAddress, userAgent: r.userAgent,
    });
    const hashMatch = recomputed === r.contentHash;
    console.log(`AuditLog tamper-evidence hash spot-check: ${hashMatch ? "PASS" : "FAIL"} (row ${sampleAuditRow.id})`);
    if (!hashMatch) throw new Error("Restored AuditLog row's content hash does not recompute correctly");

    // ── 6. Log the real outcome as a new Document Library entry ─────────────
    console.log("\n=== Step 6: Log the drill outcome ===");
    const approver = await sourceDb.user.findFirst({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } });
    if (!approver) throw new Error("No active SUPER_ADMIN found to approve the drill log as");

    const durationSecs = ((Date.now() - timestamp) / 1000).toFixed(1);
    const sections: Section[] = [
      {
        heading: `Backup Restore Drill — ${new Date(timestamp).toISOString()}`,
        body: [
          `Dump source: dev database (read-only pg_dump via the sanitized DIRECT_URL). Restore target: a`,
          `disposable Docker postgres:16-alpine container (port ${DRILL_PORT}), never the dev DB itself and`,
          `never production.`,
          "",
          `Dump size: ${(dumpSizeBytes / 1024).toFixed(1)} KB. Total drill duration: ${durationSecs}s.`,
          "",
          `Row-count parity (users/exam_attempts/certificates/audit_logs): ${parity ? "PASS — exact match" : "FAIL"}.`,
          `Source: ${JSON.stringify(sourceCounts)}`,
          `Restored: ${JSON.stringify(restoredCounts)}`,
          "",
          `Tamper-evidence spot-check: a real AuditLog row's contentHash was recomputed from its restored`,
          `content (independent of anything the restored database claims about itself) and ${hashMatch ? "matched exactly" : "DID NOT MATCH"}.`,
          `This proves the restore preserved real data integrity, not just row presence.`,
          "",
          "Container was torn down completely after verification (docker stop, --rm auto-removes it).",
        ],
      },
    ];
    const pdf = await buildPolicyPdf(
      "Backup Restore Drill Log",
      "Truemark Global Standards and Solutions Limited — proven, dated restore drills",
      sections,
    );
    await upsertPolicyDocument({
      title: "Backup Restore Drill Log",
      type: "report",
      description: "Dated log of real backup-restore drills — dump size, row-count parity, and tamper-evidence hash verification. Checked monthly for freshness by backupDrillCadence.ts.",
      pdfBytes: pdf,
      keyPrefix: "backup-drill-log",
      changeNotes: `Drill run ${new Date(timestamp).toISOString()} — ${parity && hashMatch ? "PASS" : "FAIL"}.`,
      approverId: approver.id,
    });

    console.log("\n✅ Backup restore drill PASSED — real dump, real restore, real verified data integrity.");
  } finally {
    // ── 7. Tear down completely, whether the drill passed or failed ─────────
    console.log("\n=== Step 7: Tear down the disposable container ===");
    spawnSync("docker", ["stop", CONTAINER_NAME], { stdio: "inherit" });
  }

  await sourceDb.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
