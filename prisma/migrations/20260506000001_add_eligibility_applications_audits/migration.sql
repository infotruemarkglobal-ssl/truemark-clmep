-- =============================================================================
-- Migration: add_eligibility_applications_audits
-- Fully idempotent — safe to run multiple times on any PostgreSQL environment.
-- Order: CREATE TABLE → ALTER TABLE ADD/DROP COLUMN → CREATE INDEX → ADD FK
-- =============================================================================

-- ─── STEP 1: CREATE NEW TABLES ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "scheme_applications" (
    "id"                    TEXT        NOT NULL,
    "userId"                TEXT        NOT NULL,
    "schemeId"              TEXT        NOT NULL,
    "courseId"              TEXT        NOT NULL,
    "status"                TEXT        NOT NULL DEFAULT 'PENDING',
    "declaredAge"           BOOLEAN     NOT NULL DEFAULT false,
    "declaredExperience"    INTEGER,
    "declaredQualification" TEXT,
    "priorCertNumbers"      TEXT,
    "idDocumentUrl"         TEXT,
    "qualificationDocUrl"   TEXT,
    "employerLetterUrl"     TEXT,
    "legalDeclarationAt"    TIMESTAMP(3),
    "legalDeclarationIp"    TEXT,
    "reviewedById"          TEXT,
    "reviewedAt"            TIMESTAMP(3),
    "rejectionReason"       TEXT,
    "autoApprovedAt"        TIMESTAMP(3),
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scheme_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "internal_audits" (
    "id"            TEXT        NOT NULL,
    "reference"     TEXT        NOT NULL,
    "title"         TEXT        NOT NULL,
    "scope"         TEXT        NOT NULL,
    "auditType"     TEXT        NOT NULL DEFAULT 'INTERNAL',
    "status"        TEXT        NOT NULL DEFAULT 'PLANNED',
    "plannedDate"   TIMESTAMP(3) NOT NULL,
    "completedAt"   TIMESTAMP(3),
    "leadAuditorId" TEXT        NOT NULL,
    "findings"      TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "internal_audits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "certificate_terms_acks" (
    "id"            TEXT        NOT NULL,
    "certificateId" TEXT        NOT NULL,
    "userId"        TEXT        NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress"     TEXT,
    CONSTRAINT "certificate_terms_acks_pkey" PRIMARY KEY ("id")
);

-- ─── STEP 2: ALTER EXISTING TABLES ───────────────────────────────────────────

-- enrolments: application-process columns (ISO 17024 Cl.6.2)
ALTER TABLE "enrolments" ADD COLUMN IF NOT EXISTS "application_status"      TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "enrolments" ADD COLUMN IF NOT EXISTS "application_ref"          TEXT;
ALTER TABLE "enrolments" ADD COLUMN IF NOT EXISTS "application_notes"        TEXT;
ALTER TABLE "enrolments" ADD COLUMN IF NOT EXISTS "application_reviewed_at"  TIMESTAMP(3);
ALTER TABLE "enrolments" ADD COLUMN IF NOT EXISTS "application_reviewed_by"  TEXT;

-- non_conformities: drop legacy plain-string columns, add FK columns
-- Drop the old index first (references the old column name)
DROP INDEX IF EXISTS "non_conformities_assignedTo_idx";

-- Remove old plain-string columns (data loss is acceptable — they stored free-text
-- user names/IDs with no referential integrity; new FK columns replace them)
ALTER TABLE "non_conformities" DROP COLUMN IF EXISTS "reportedBy";
ALTER TABLE "non_conformities" DROP COLUMN IF EXISTS "assignedTo";

-- Add new FK columns BEFORE any indexes reference them
ALTER TABLE "non_conformities" ADD COLUMN IF NOT EXISTS "reportedById" TEXT;
ALTER TABLE "non_conformities" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE "non_conformities" ADD COLUMN IF NOT EXISTS "auditId"      TEXT;

-- ─── STEP 3: CREATE INDEXES ───────────────────────────────────────────────────

-- scheme_applications
CREATE INDEX IF NOT EXISTS "scheme_applications_userId_schemeId_idx"
    ON "scheme_applications"("userId", "schemeId");

-- internal_audits
CREATE UNIQUE INDEX IF NOT EXISTS "internal_audits_reference_key"
    ON "internal_audits"("reference");
CREATE INDEX IF NOT EXISTS "internal_audits_status_idx"
    ON "internal_audits"("status");
CREATE INDEX IF NOT EXISTS "internal_audits_leadAuditorId_idx"
    ON "internal_audits"("leadAuditorId");

-- certificate_terms_acks
CREATE UNIQUE INDEX IF NOT EXISTS "certificate_terms_acks_certificateId_userId_key"
    ON "certificate_terms_acks"("certificateId", "userId");

-- enrolments (on newly added column)
CREATE UNIQUE INDEX IF NOT EXISTS "enrolments_application_ref_key"
    ON "enrolments"("application_ref");

-- non_conformities (on newly added columns)
CREATE INDEX IF NOT EXISTS "non_conformities_assignedToId_idx"
    ON "non_conformities"("assignedToId");
CREATE INDEX IF NOT EXISTS "non_conformities_auditId_idx"
    ON "non_conformities"("auditId");

-- ─── STEP 4: ADD FOREIGN KEYS (idempotent via exception handler) ─────────────

DO $$ BEGIN
  ALTER TABLE "non_conformities"
    ADD CONSTRAINT "non_conformities_reportedById_fkey"
    FOREIGN KEY ("reportedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "non_conformities"
    ADD CONSTRAINT "non_conformities_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "non_conformities"
    ADD CONSTRAINT "non_conformities_auditId_fkey"
    FOREIGN KEY ("auditId") REFERENCES "internal_audits"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "scheme_applications"
    ADD CONSTRAINT "scheme_applications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "scheme_applications"
    ADD CONSTRAINT "scheme_applications_schemeId_fkey"
    FOREIGN KEY ("schemeId") REFERENCES "certification_schemes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "scheme_applications"
    ADD CONSTRAINT "scheme_applications_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "courses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "scheme_applications"
    ADD CONSTRAINT "scheme_applications_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "internal_audits"
    ADD CONSTRAINT "internal_audits_leadAuditorId_fkey"
    FOREIGN KEY ("leadAuditorId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "certificate_terms_acks"
    ADD CONSTRAINT "certificate_terms_acks_certificateId_fkey"
    FOREIGN KEY ("certificateId") REFERENCES "certificates"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "certificate_terms_acks"
    ADD CONSTRAINT "certificate_terms_acks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
