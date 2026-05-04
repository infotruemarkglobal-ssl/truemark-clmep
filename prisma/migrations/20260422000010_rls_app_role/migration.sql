-- Migration: 20260422000010_rls_app_role
--
-- Root cause of the previous RLS migration not working:
--   neondb_owner has rolbypassrls = true, so it skips ALL RLS policies
--   even with FORCE ROW LEVEL SECURITY on the table.
--
-- Fix: create a second role (neondb_app) that has NO bypass privilege.
-- The application switches into this role at the start of every org-scoped
-- transaction using set_config('role', 'neondb_app', true) — equivalent to
-- SET LOCAL ROLE, automatically reverted when the transaction ends.
-- neondb_owner retains full access for migrations and admin operations.

-- ── Create the restricted application role ────────────────────────────────────

-- IF NOT EXISTS guards against re-runs (prisma db execute is not transactional
-- for DDL so this migration may partially succeed on retry).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'neondb_app') THEN
    CREATE ROLE neondb_app WITH
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOLOGIN
      NOBYPASSRLS;   -- ← the key attribute: subject to RLS policies
  END IF;
END
$$;

-- ── Grant neondb_app to neondb_owner ─────────────────────────────────────────
-- Required so neondb_owner can switch roles via set_config('role', ...).
-- Without this GRANT, SET ROLE neondb_app would be rejected.

GRANT neondb_app TO neondb_owner;

-- ── Data privileges for neondb_app ───────────────────────────────────────────
-- neondb_app needs to be able to read and write all tables so that queries
-- inside withOrgContext() work correctly after the role switch.

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO neondb_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO neondb_app;

-- Ensure future tables (from migrations run after this one) also grant to neondb_app.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO neondb_app;

ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO neondb_app;
