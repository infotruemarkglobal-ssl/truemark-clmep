# Supabase Production Setup

## Initial Setup

1. Create a new project at [supabase.com](https://supabase.com), region: **West EU (Ireland)** (closest to UK/EU users).
2. Go to **Project Settings → Database → Connection string**.
3. Copy the **Transaction Pooler** URL (port 6543) → set as `DATABASE_URL` in your production environment.
4. Copy the **Direct Connection** URL (port 5432) → set as `DIRECT_URL` in your production environment.
5. Append `&pgbouncer=true&connection_limit=5` to `DATABASE_URL` to stay within Supabase free-tier connection limits.

Example values:
```
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5"
DIRECT_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
```

## Running Migrations

```bash
npm run db:migrate:prod
```

This runs `prisma migrate deploy`, which reads `DIRECT_URL` (via `prisma.config.ts`) and applies all pending migrations through a **direct connection**, bypassing PgBouncer.

**Never run migrations against the Transaction Pooler URL (port 6543).** PgBouncer does not support the DDL statements Prisma issues during `migrate deploy` and will silently fail or error.

## Connection Limits

| Tier | Direct connections | Notes |
|------|--------------------|-------|
| Free | 60 total | Shared across all Prisma instances |
| Pro  | 200+               | |

PgBouncer (Transaction Pooler) multiplexes application connections into a smaller pool of direct connections. Setting `connection_limit=5` in `DATABASE_URL` means each serverless function instance opens at most 5 connections to the pooler, which PgBouncer maps to far fewer direct database connections.

If you see `too many connections` errors, lower `connection_limit` further (try 2–3 for Vercel serverless).

## PgBouncer Compatibility

All `db.$transaction()` calls in this codebase use the **array/batch form**, which is fully compatible with PgBouncer transaction-pooling mode:

```typescript
// ✓ Array form — PgBouncer compatible
await db.$transaction([op1, op2, op3]);

// ✗ Callback form — NOT compatible with PgBouncer transaction mode
await db.$transaction(async (tx) => { ... });
```

The callback (interactive transaction) form holds a connection open across multiple async ticks. PgBouncer transaction mode may reassign that connection to another client between ticks, causing deadlocks or data corruption. All such patterns have been removed from this codebase.

## Switching Environments

| Environment | DATABASE_URL | DIRECT_URL |
|-------------|-------------|------------|
| Local dev   | `postgresql://postgres:postgres@localhost:5432/clmep` (Docker) | same |
| Staging     | Neon pooled URL (port 5432, `?pgbouncer=true`) | Neon direct URL |
| Production  | Supabase Transaction Pooler (port 6543) | Supabase Direct (port 5432) |

**Never run migrations against the pooler URL in any environment.**
