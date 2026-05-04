-- Migration: 20260422000006_candidate_registration_type
-- Adds registrationType + sponsoringOrgId to candidate_profiles,
-- registrationSource + organisationId to enrolments,
-- organisationId to exam_attempts, certificates, cpd_records.

-- ─── candidate_profiles ──────────────────────────────────────────────────────

ALTER TABLE "candidate_profiles"
  ADD COLUMN IF NOT EXISTS "registration_type"  TEXT NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN IF NOT EXISTS "sponsoring_org_id"  TEXT;

ALTER TABLE "candidate_profiles"
  ADD CONSTRAINT "candidate_profiles_registration_type_check"
  CHECK ("registration_type" IN ('INDIVIDUAL', 'ORG_SPONSORED', 'ORG_SELF_ENROL'));

ALTER TABLE "candidate_profiles"
  ADD CONSTRAINT "candidate_profiles_sponsoring_org_id_fkey"
  FOREIGN KEY ("sponsoring_org_id") REFERENCES "organisations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "candidate_profiles_sponsoring_org_id_idx"
  ON "candidate_profiles"("sponsoring_org_id");

CREATE INDEX IF NOT EXISTS "candidate_profiles_registration_type_idx"
  ON "candidate_profiles"("registration_type");

-- ─── enrolments ──────────────────────────────────────────────────────────────

ALTER TABLE "enrolments"
  ADD COLUMN IF NOT EXISTS "organisation_id"      TEXT,
  ADD COLUMN IF NOT EXISTS "registration_source"  TEXT NOT NULL DEFAULT 'SELF';

ALTER TABLE "enrolments"
  ADD CONSTRAINT "enrolments_registration_source_check"
  CHECK ("registration_source" IN ('SELF', 'ORG_ASSIGNED'));

ALTER TABLE "enrolments"
  ADD CONSTRAINT "enrolments_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "enrolments_organisation_id_idx"
  ON "enrolments"("organisation_id");

CREATE INDEX IF NOT EXISTS "enrolments_organisation_id_status_idx"
  ON "enrolments"("organisation_id", "status")
  WHERE "organisation_id" IS NOT NULL;

-- ─── exam_attempts ───────────────────────────────────────────────────────────

ALTER TABLE "exam_attempts"
  ADD COLUMN IF NOT EXISTS "organisation_id" TEXT;

ALTER TABLE "exam_attempts"
  ADD CONSTRAINT "exam_attempts_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "exam_attempts_organisation_id_idx"
  ON "exam_attempts"("organisation_id");

CREATE INDEX IF NOT EXISTS "exam_attempts_organisation_id_status_idx"
  ON "exam_attempts"("organisation_id", "status")
  WHERE "organisation_id" IS NOT NULL;

-- ─── certificates ────────────────────────────────────────────────────────────

ALTER TABLE "certificates"
  ADD COLUMN IF NOT EXISTS "organisation_id"              TEXT,
  ADD COLUMN IF NOT EXISTS "sponsoring_org_name_snapshot" TEXT;

ALTER TABLE "certificates"
  ADD CONSTRAINT "certificates_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "certificates_organisation_id_status_idx"
  ON "certificates"("organisation_id", "status")
  WHERE "organisation_id" IS NOT NULL;

-- ─── cpd_records ─────────────────────────────────────────────────────────────

ALTER TABLE "cpd_records"
  ADD COLUMN IF NOT EXISTS "organisation_id"    TEXT,
  ADD COLUMN IF NOT EXISTS "logged_by"          TEXT NOT NULL DEFAULT 'SELF',
  ADD COLUMN IF NOT EXISTS "logged_by_user_id"  TEXT;

ALTER TABLE "cpd_records"
  ADD CONSTRAINT "cpd_records_logged_by_check"
  CHECK ("logged_by" IN ('SELF', 'ORG_MANAGER'));

ALTER TABLE "cpd_records"
  ADD CONSTRAINT "cpd_records_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cpd_records"
  ADD CONSTRAINT "cpd_records_logged_by_user_id_fkey"
  FOREIGN KEY ("logged_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "cpd_records_organisation_id_status_idx"
  ON "cpd_records"("organisation_id", "status")
  WHERE "organisation_id" IS NOT NULL;

-- ─── purchases (missing index from prior audit) ───────────────────────────────
-- Note: purchases.organisationId has no @map so the DB column is camelCase.

CREATE INDEX IF NOT EXISTS "purchases_organisation_id_idx"
  ON "purchases"("organisationId")
  WHERE "organisationId" IS NOT NULL;

-- ─── Backfill: all pre-existing rows are definitively INDIVIDUAL / SELF ───────
-- Historic enrolments were all self-initiated (ORG_ASSIGNED path did not exist).
-- Note: enrolments.registration_source is a new column with DEFAULT 'SELF', so
-- no rows will have NULL here; UPDATE is a no-op but harmless.
UPDATE "enrolments" SET "registration_source" = 'SELF'
  WHERE "registration_source" IS NULL;

-- Candidates with no org membership → INDIVIDUAL (already the column default).
-- Candidates in exactly one org → ORG_SELF_ENROL + set sponsoring_org_id.
-- Note: candidate_profiles.userId and organisation_members.userId/organisationId
-- are camelCase (no @map on those original fields).
UPDATE "candidate_profiles" cp
SET "registration_type" = 'ORG_SELF_ENROL',
    "sponsoring_org_id" = (
      SELECT om."organisationId"
      FROM "organisation_members" om
      WHERE om."userId" = cp."userId"
      LIMIT 1
    )
WHERE (
  SELECT COUNT(*) FROM "organisation_members" om WHERE om."userId" = cp."userId"
) = 1;
-- Multi-org users left as INDIVIDUAL (safe default); flag for manual review:
-- SELECT cp."userId" FROM candidate_profiles cp
-- JOIN organisation_members om ON om."userId" = cp."userId"
-- GROUP BY cp."userId" HAVING COUNT(*) > 1;
