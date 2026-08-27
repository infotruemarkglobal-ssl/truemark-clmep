-- Migration: 20260827000001_narrow_varchar_and_drop_iddocumentref
--
-- Resolves the two schema/migration drift items deliberately deferred earlier
-- this session, after a data audit against production (Supabase) confirmed
-- both are safe:
--
--   candidate_profiles.idDocumentRef: exists in prod as `text`, but all 14
--   rows have it NULL — no data loss from dropping it.
--
--   VARCHAR narrowing below: checked max(length(...)) against every proposed
--   limit for every affected column in production — zero rows exceed the new
--   limit in any of them (largest actual value found: courses.title at 51
--   chars, well under the 200 limit). All four tables are small (<25 rows),
--   so the ACCESS EXCLUSIVE lock each ALTER COLUMN briefly takes is not a
--   meaningful availability concern.

-- ── candidate_profiles ───────────────────────────────────────────────────────
ALTER TABLE "candidate_profiles" DROP COLUMN IF EXISTS "idDocumentRef";

-- ── certification_schemes ────────────────────────────────────────────────────
ALTER TABLE "certification_schemes"
  ALTER COLUMN "code" SET DATA TYPE VARCHAR(50),
  ALTER COLUMN "name" SET DATA TYPE VARCHAR(200);

-- ── courses ───────────────────────────────────────────────────────────────────
ALTER TABLE "courses"
  ALTER COLUMN "title" SET DATA TYPE VARCHAR(200),
  ALTER COLUMN "slug" SET DATA TYPE VARCHAR(100);

-- ── users ─────────────────────────────────────────────────────────────────────
ALTER TABLE "users"
  ALTER COLUMN "email" SET DATA TYPE VARCHAR(254),
  ALTER COLUMN "firstName" SET DATA TYPE VARCHAR(100),
  ALTER COLUMN "lastName" SET DATA TYPE VARCHAR(100),
  ALTER COLUMN "phone" SET DATA TYPE VARCHAR(30);
