-- Migration: 20260422000009_rls_org_isolation
--
-- Adds PostgreSQL Row-Level Security to every table that holds multi-tenant data.
--
-- HOW IT WORKS
-- ─────────────
-- Before running any org-scoped query, the application calls:
--   SELECT set_config('app.current_org_id', '<orgId>', true)
-- (the third argument `true` means "local to this transaction" — it resets
-- automatically when the transaction ends, safe with PgBouncer).
--
-- The RLS policy then automatically adds a WHERE filter to every SELECT,
-- INSERT, UPDATE, and DELETE on these tables for the duration of that
-- transaction. A developer cannot accidentally forget the WHERE clause.
--
-- BYPASS RULE (the escape hatch)
-- ───────────────────────────────
-- When the setting is empty (not set), ALL rows are visible. This covers:
--   • Database migrations (no org context set)
--   • Seed scripts
--   • SUPER_ADMIN / CERTIFICATION_OFFICER queries
--   • Any route that legitimately needs cross-org visibility
--
-- FORCE ROW LEVEL SECURITY
-- ─────────────────────────
-- Without FORCE, the database owner (postgres) bypasses RLS entirely
-- — making the whole feature pointless. FORCE makes the owner obey the
-- same policies as every other role. The bypass rule above keeps migrations
-- and admin queries working.
--
-- COLUMN NAMING NOTE
-- ───────────────────
-- Tables whose Prisma fields have @map use snake_case in the DB:
--   enrolments          → "organisation_id"
--   exam_attempts       → "organisation_id"
--   certificates        → "organisation_id"
--   cpd_records         → "organisation_id"
-- Tables without @map use camelCase (as written in CREATE TABLE):
--   organisation_members → "organisationId"
--   departments          → "organisationId"

-- ─── Helper: read the current org context, return '' if not set ───────────────
-- (current_setting with missing_ok=true returns '' instead of throwing)

-- ─── enrolments ──────────────────────────────────────────────────────────────

ALTER TABLE "enrolments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrolments" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON "enrolments";
CREATE POLICY "org_isolation" ON "enrolments"
  USING (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisation_id" = current_setting('app.current_org_id', true)
  )
  WITH CHECK (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisation_id" = current_setting('app.current_org_id', true)
    OR "organisation_id" IS NULL
  );

-- ─── exam_attempts ───────────────────────────────────────────────────────────

ALTER TABLE "exam_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_attempts" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON "exam_attempts";
CREATE POLICY "org_isolation" ON "exam_attempts"
  USING (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisation_id" = current_setting('app.current_org_id', true)
  )
  WITH CHECK (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisation_id" = current_setting('app.current_org_id', true)
    OR "organisation_id" IS NULL
  );

-- ─── certificates ────────────────────────────────────────────────────────────

ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificates" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON "certificates";
CREATE POLICY "org_isolation" ON "certificates"
  USING (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisation_id" = current_setting('app.current_org_id', true)
  )
  WITH CHECK (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisation_id" = current_setting('app.current_org_id', true)
    OR "organisation_id" IS NULL
  );

-- ─── cpd_records ─────────────────────────────────────────────────────────────

ALTER TABLE "cpd_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cpd_records" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON "cpd_records";
CREATE POLICY "org_isolation" ON "cpd_records"
  USING (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisation_id" = current_setting('app.current_org_id', true)
  )
  WITH CHECK (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisation_id" = current_setting('app.current_org_id', true)
    OR "organisation_id" IS NULL
  );

-- ─── organisation_members ────────────────────────────────────────────────────
-- Note: column is "organisationId" (camelCase, no @map on this field)

ALTER TABLE "organisation_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organisation_members" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON "organisation_members";
CREATE POLICY "org_isolation" ON "organisation_members"
  USING (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisationId" = current_setting('app.current_org_id', true)
  )
  WITH CHECK (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisationId" = current_setting('app.current_org_id', true)
  );

-- ─── departments ─────────────────────────────────────────────────────────────
-- Note: column is "organisationId" (camelCase, no @map on this field)

ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON "departments";
CREATE POLICY "org_isolation" ON "departments"
  USING (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisationId" = current_setting('app.current_org_id', true)
  )
  WITH CHECK (
    current_setting('app.current_org_id', true) = ''
    OR current_setting('app.current_org_id', true) IS NULL
    OR "organisationId" = current_setting('app.current_org_id', true)
  );
