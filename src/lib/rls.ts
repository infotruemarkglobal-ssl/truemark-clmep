/**
 * withOrgContext — run Prisma operations inside a PostgreSQL Row-Level Security context.
 *
 * Usage in any ORG_MANAGER route:
 *
 *   import { withOrgContext } from "@/lib/rls";
 *
 *   await withOrgContext(db, orgId, async (tx) => {
 *     await tx.enrolment.create({ data: { ... } });
 *     await tx.candidateProfile.upsert({ ... });
 *   });
 *
 * What it does:
 *   1. Opens a database transaction.
 *   2. Sets app.current_org_id = orgId for that transaction only.
 *      (set_config with is_local=true resets automatically when the
 *       transaction ends — safe with PgBouncer's transaction-mode pooling.)
 *   3. Runs your callback. Every Prisma query inside the callback runs
 *      through the RLS policy — the DB engine silently filters out any
 *      row that doesn't belong to orgId, even if the WHERE clause is missing.
 *   4. Commits on success, rolls back on any throw.
 *
 * Outside this wrapper (routes with no org context):
 *   app.current_org_id is '' (empty string) → RLS policy allows all rows.
 *   SUPER_ADMIN, CERTIFICATION_OFFICER, and migrations all work unchanged.
 */

import { PrismaClient } from "@prisma/client";

// The type Prisma passes to $transaction callbacks — has all model methods
// but not the client-level methods like $connect, $transaction itself, etc.
type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export async function withOrgContext<T>(
  db: PrismaClient,
  orgId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    // Step 1 — switch to the restricted role.
    // neondb_owner has rolbypassrls=true so it skips all RLS policies.
    // neondb_app has rolbypassrls=false — it is subject to the policies.
    // set_config('role', ..., true) is equivalent to SET LOCAL ROLE and
    // reverts automatically when this transaction ends.
    await tx.$queryRaw`SELECT set_config('role', 'neondb_app', true)`;

    // Step 2 — stamp the org context.
    // The RLS policy on each table reads this setting and hides rows that
    // don't belong to this org for the rest of this transaction.
    await tx.$queryRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;

    return fn(tx);
  });
}
