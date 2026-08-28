-- Migration: 20260827000002_grant_neondb_app_schema_usage
--
-- The original RLS migration (20260422000010_rls_app_role) granted neondb_app
-- privileges on every table and sequence, but never granted USAGE on the
-- schema itself — a role needs schema-level USAGE to access ANY object inside
-- it, even with object-level grants already in place.
--
-- This went unnoticed because it worked by accident in production: Supabase's
-- `public` schema grants USAGE to PUBLIC by default (every role inherits it),
-- so neondb_app happened to already have it there. Neon's CI branch does not
-- carry that same default, so withOrgContext() there failed with
-- "permission denied for schema public" on every org-scoped query — caught by
-- the integration test suite, not by production traffic. Fixing explicitly
-- rather than continuing to rely on a provider-specific default.
GRANT USAGE ON SCHEMA public TO neondb_app;

-- Re-run the table/sequence grants defensively. The original migration's
-- ALTER DEFAULT PRIVILEGES was scoped "FOR ROLE postgres", which only covers
-- future tables created by that specific role — correct on Supabase (where
-- postgres runs migrations) but not on Neon (where neondb_owner does), so any
-- table added by a migration since 20260422000010 may not have been covered
-- there. GRANT ... ON ALL TABLES is a one-time, idempotent catch-up; it does
-- not need IF NOT EXISTS guarding.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO neondb_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO neondb_app;

-- Wire default privileges for whichever role actually owns objects in this
-- environment ("postgres" on Supabase, "neondb_owner" on Neon), guarded so
-- this migration succeeds unmodified on both platforms.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO neondb_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO neondb_app';
  END IF;
END
$$;
