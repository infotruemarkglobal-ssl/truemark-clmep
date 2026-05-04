import "dotenv/config";
import { defineConfig } from "prisma/config";

// DIRECT_URL must point at the Neon direct (non-pooled) endpoint.
// DATABASE_URL uses the pooled endpoint (?pgbouncer=true) — it cannot be used
// for migrations because PgBouncer does not support the DDL statements Prisma
// issues during `prisma migrate deploy`.
//
// CI/test mode: when TEST_DIRECT_URL is set (e.g. pointing at a Neon CI branch),
// it takes priority over DIRECT_URL so migrations run against the test branch
// without touching the production URLs. Set TEST_DIRECT_URL in .env to use this.
//
// If no direct URL is available we fall back to DATABASE_URL but warn loudly,
// because running migrations through PgBouncer can cause silent failures.
const directUrl =
  process.env.TEST_DIRECT_URL ??
  process.env.DIRECT_URL ??
  "";

if (!directUrl) {
  if (process.env.DATABASE_URL) {
    console.warn(
      "[prisma.config] DIRECT_URL is not set — falling back to DATABASE_URL for migrations. " +
      "This will fail if DATABASE_URL points at the PgBouncer pooler endpoint. " +
      "Set DIRECT_URL to the non-pooled Neon connection string.",
    );
  } else {
    throw new Error("[prisma.config] Neither DIRECT_URL nor DATABASE_URL is set.");
  }
}

if (process.env.TEST_DIRECT_URL) {
  console.log("[prisma.config] CI/test mode: using TEST_DIRECT_URL for migrations.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx ts-node --project tsconfig.seed.json prisma/seed.ts",
  },
  datasource: {
    url: directUrl || process.env.DATABASE_URL || "",
  },
});
