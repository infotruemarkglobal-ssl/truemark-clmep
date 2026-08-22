-- Fixes schema/migration drift on four tables where schema.prisma had columns
-- that no prior migration ever created — the same class of bug as
-- 20260822000001_add_exam_only_fields (courses.examOnly). Each of these was
-- confirmed to crash a live, unscoped Prisma query in production:
--   certification_schemes: POST /api/cpd 500s whenever a schemeId is supplied
--   coi_declarations:      certificate generation 500s on every request
--   cpd_records:           the CPD API/pages and GDPR data-subject-request
--                          fulfilment all 500
--   custom_roles:          the /platform/permissions page and all role CRUD
--                          API routes 500
-- Guarded with IF NOT EXISTS / constraint checks so this is safe to run
-- against environments where some of these may already have been added
-- out-of-band.
--
-- NOT included here (deliberately out of scope for this fix):
--   - candidate_profiles.idDocumentRef: schema.prisma no longer defines this
--     column, but it still exists in the database. It is a harmless *extra*
--     column (unscoped queries only break on *missing* columns, not extra
--     ones) and dropping it would destroy any stored document references.
--     Needs an explicit decision, not a silent drop.
--   - VARCHAR length narrowing on certification_schemes.code/name,
--     courses.title/slug, users.email/firstName/lastName/phone: these are
--     schema.prisma changes from TEXT to a shorter VARCHAR(n). None of them
--     were confirmed to cause a live crash, and narrowing a column can fail
--     outright (or need review) if existing data already exceeds the new
--     length limit. Needs a data audit first.

-- AlterTable: certification_schemes
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "autoApproveMinutes" INTEGER NOT NULL DEFAULT 2880;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "eligibilityEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "eligibilityNotes" TEXT;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "minAgeYears" INTEGER;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "minExperienceYears" INTEGER;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "renewalExamWindowMonths" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "renewalRequiresCPD" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "renewalRequiresExam" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "requiredPriorCerts" TEXT;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "requiredQualifications" TEXT;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "requiresDocuments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "requiresEmployerLetter" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "certification_schemes" ADD COLUMN IF NOT EXISTS "requiresIdDocument" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: coi_declarations
ALTER TABLE "coi_declarations" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coi_declarations_status_idx" ON "coi_declarations"("status");

-- AlterTable: cpd_records
ALTER TABLE "cpd_records" ADD COLUMN IF NOT EXISTS "activityType" TEXT NOT NULL DEFAULT 'FORMAL_TRAINING';
ALTER TABLE "cpd_records" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "cpd_records" ADD COLUMN IF NOT EXISTS "verifiedById" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cpd_records_verifiedById_fkey'
  ) THEN
    ALTER TABLE "cpd_records" ADD CONSTRAINT "cpd_records_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable: custom_roles
ALTER TABLE "custom_roles" ADD COLUMN IF NOT EXISTS "baseRole" TEXT NOT NULL DEFAULT 'CANDIDATE';
