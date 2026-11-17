/**
 * Daily external notarisation of the audit-log hash chain — ISO 27001
 * A.8.15. The chain itself (AuditLog.previousHash, wired up in
 * src/lib/audit.ts) already lets an offline check detect a deleted or
 * reordered row; this cron closes the remaining gap — proving the chain
 * tip that existed at a given moment hasn't since been silently replaced
 * wholesale (deleted and reconstructed) — by getting a real RFC 3161
 * timestamp token from a live public Certificate-Authority TSA, attesting
 * "this exact digest existed at this exact time." That attestation is
 * independently re-verifiable by anyone re-parsing the token bytes; it does
 * not depend on trusting this application's own database.
 *
 * IDEMPOTENCY
 * ───────────
 * Skips outright if an AuditAnchor already exists for the current chain-tip
 * digest — safe to re-run any number of times per day; only a genuinely new
 * chain tip (i.e. at least one new AuditLog row since the last anchor)
 * produces a new anchor.
 */

import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { requestTimestampAttestation } from "@/lib/timestamp-anchor";

export const auditAnchor = inngest.createFunction(
  {
    id: "audit-log-anchor",
    name: "External notarisation of the audit-log hash chain",
    retries: 3,
    triggers: [{ cron: "0 9 * * *" }],
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: unknown; name: string };
      error: Error;
    }) => {
      Sentry.captureException(error, {
        tags: { inngest_function: "audit-log-anchor" },
        extra: { event },
      });
      console.error("[inngest:audit-log-anchor] All retries exhausted.", error);
    },
  },
  async ({ step }: { step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const result = await step.run("anchor-chain-tip", async () => {
      const tip = await db.auditLog.findFirst({
        orderBy: { timestamp: "desc" },
        select: { id: true, contentHash: true },
      });
      if (!tip?.contentHash) return { anchored: false, reason: "no audit log rows yet" };

      const alreadyAnchored = await db.auditAnchor.findFirst({
        where: { digestHash: tip.contentHash },
        select: { id: true },
      });
      if (alreadyAnchored) return { anchored: false, reason: "chain tip unchanged since last anchor" };

      const attestation = await requestTimestampAttestation(tip.contentHash);

      const anchor = await db.auditAnchor.create({
        data: {
          digestHash: tip.contentHash,
          chainTipLogId: tip.id,
          tsaUrl: attestation.tsaUrl,
          tsaResponse: attestation.responseBytes.toString("base64"),
          tsaGenTime: attestation.genTime,
          tsaSerial: attestation.serialNumber,
        },
      });

      return { anchored: true, anchorId: anchor.id, chainTipLogId: tip.id };
    });

    return result;
  },
);
