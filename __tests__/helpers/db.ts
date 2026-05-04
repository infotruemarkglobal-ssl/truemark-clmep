/**
 * Test-scoped Prisma client.
 *
 * Points at TEST_DATABASE_URL when set, falls back to DATABASE_URL.
 * The same instance is used both in test assertions and (via the jest.mock
 * factory in the test file) inside the route handlers under test — so writes
 * from route handlers are immediately visible to test assertions on this client.
 *
 * WARNING: tests run against a real database. Set TEST_DATABASE_URL to an
 * isolated branch/schema if you don't want test data in your dev database.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

function createTestClient(): PrismaClient {
  // Prefer DIRECT_URL: the pooled DATABASE_URL has pgbouncer=true which is
  // incompatible with long-lived test process connections.
  const url =
    process.env.TEST_DATABASE_URL ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    "";
  if (!url) throw new Error("TEST_DATABASE_URL, DIRECT_URL, or DATABASE_URL must be set for tests");
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

// Singleton — one connection per test worker
let _client: PrismaClient | null = null;

export function getTestDb(): PrismaClient {
  _client ??= createTestClient();
  return _client;
}

export async function disconnectTestDb(): Promise<void> {
  await _client?.$disconnect();
  _client = null;
}
