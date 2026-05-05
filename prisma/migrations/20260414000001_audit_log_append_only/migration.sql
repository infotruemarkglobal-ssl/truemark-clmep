-- ISO 17024 Cl.9.5 — Audit log append-only enforcement
--
-- The audit_logs table must be append-only at the database level.
-- Prisma uses a single application role (the DATABASE_URL credentials) which
-- by default has SELECT, INSERT, UPDATE, DELETE on all tables. This migration
-- creates a restricted role that can only INSERT and SELECT on audit_logs, and
-- revokes UPDATE and DELETE from the application role on that table.
--
-- Run this ONCE against production after confirming no application code
-- legitimately updates or deletes audit log rows (none does as of this migration).
--
-- Step 1: Revoke destructive permissions from the application role on audit_logs.
-- Replace 'postgres' with your actual Neon/Postgres application role name.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM postgres;

-- Step 2: Grant a separate audit-reader role SELECT-only access (for the
-- Auditor role UI queries and management reports).
-- CREATE ROLE truemark_audit_reader LOGIN PASSWORD '<strong-random-password>';
-- GRANT SELECT ON TABLE audit_logs TO truemark_audit_reader;
-- GRANT CONNECT ON DATABASE neondb TO truemark_audit_reader;

-- Step 3: Confirm effective permissions (run manually, do not include in CI):
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_name = 'audit_logs';

-- Verification: After running this migration the following must fail:
-- UPDATE audit_logs SET action = 'tampered' WHERE id = '<any id>';   -- must fail
-- DELETE FROM audit_logs WHERE id = '<any id>';                       -- must fail
-- INSERT INTO audit_logs (action, timestamp) VALUES ('test', now()); -- must succeed

-- Backup note (Cl.9.5 records retention):
-- Neon provides point-in-time restore (PITR) on paid plans up to the retention
-- period configured. Confirm at: https://console.neon.tech > Project > Backups
-- Minimum recommended retention: 7 years (certificate records lifespan).
-- For additional assurance, configure a daily pg_dump export to a separate
-- storage bucket in a different region using a Neon scheduled export or cron job.
