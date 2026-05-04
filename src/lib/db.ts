import "@/lib/env"; // Validate required env vars at startup
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Use globalThis to survive HMR re-evaluations in development and
// avoid creating multiple PrismaClient instances.
const g = globalThis as unknown as { prisma?: PrismaClient };

if (!g.prisma) {
  // PrismaPg({ connectionString }) creates its own internal pg.Pool and
  // correctly reads pgbouncer=true from the URL to disable prepared statements
  // (required for Neon's PgBouncer in transaction mode).
  // Do NOT pass an external pg.Pool here — it bypasses pgbouncer handling
  // and causes "Server has closed the connection" errors.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
  });
  g.prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = g.prisma!;
