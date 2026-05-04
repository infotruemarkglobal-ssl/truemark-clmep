-- ─── Indexes and soft-delete columns ─────────────────────────────────────────
--
-- This migration:
--   1. Adds all missing FK and filter indexes across every model (zero existed before).
--   2. Adds soft-delete (deletedAt) columns to Certificate and ExamAttempt.
--
-- Performance impact: CREATE INDEX CONCURRENTLY does not lock the table for reads
-- or writes on PostgreSQL. Neon supports it. Run each statement individually if
-- this migration is applied manually; prisma migrate deploy wraps the file in a
-- transaction, so CONCURRENTLY is not valid inside it — remove CONCURRENTLY if
-- running via `prisma migrate deploy`.
--
-- NOTE: Unique constraints (@@unique) already created their own indexes at init.
-- The indexes below are supplementary covering indexes for non-unique columns.

-- accounts
CREATE INDEX IF NOT EXISTS "accounts_userId_idx" ON "accounts" ("userId");

-- sessions
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions" ("userId");
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" ("expires");

-- organisation_members
CREATE INDEX IF NOT EXISTS "organisation_members_organisationId_idx" ON "organisation_members" ("organisationId");
CREATE INDEX IF NOT EXISTS "organisation_members_departmentId_idx" ON "organisation_members" ("departmentId");

-- departments
CREATE INDEX IF NOT EXISTS "departments_organisationId_idx" ON "departments" ("organisationId");

-- courses
CREATE INDEX IF NOT EXISTS "courses_schemeId_idx" ON "courses" ("schemeId");
CREATE INDEX IF NOT EXISTS "courses_status_idx" ON "courses" ("status");
CREATE INDEX IF NOT EXISTS "courses_creatorId_idx" ON "courses" ("creatorId");

-- course_modules
CREATE INDEX IF NOT EXISTS "course_modules_courseId_idx" ON "course_modules" ("courseId");

-- course_lessons
CREATE INDEX IF NOT EXISTS "course_lessons_moduleId_idx" ON "course_lessons" ("moduleId");

-- enrolments
CREATE INDEX IF NOT EXISTS "enrolments_userId_status_idx" ON "enrolments" ("userId", "status");
CREATE INDEX IF NOT EXISTS "enrolments_courseId_idx" ON "enrolments" ("courseId");
CREATE INDEX IF NOT EXISTS "enrolments_status_idx" ON "enrolments" ("status");
CREATE INDEX IF NOT EXISTS "enrolments_expiresAt_idx" ON "enrolments" ("expiresAt");

-- exam_papers
CREATE INDEX IF NOT EXISTS "exam_papers_schemeId_idx" ON "exam_papers" ("schemeId");
CREATE INDEX IF NOT EXISTS "exam_papers_creatorId_idx" ON "exam_papers" ("creatorId");
CREATE INDEX IF NOT EXISTS "exam_papers_isActive_idx" ON "exam_papers" ("isActive");

-- exam_sections
CREATE INDEX IF NOT EXISTS "exam_sections_examPaperId_idx" ON "exam_sections" ("examPaperId");

-- exam_questions
CREATE INDEX IF NOT EXISTS "exam_questions_sectionId_idx" ON "exam_questions" ("sectionId");
CREATE INDEX IF NOT EXISTS "exam_questions_isArchived_idx" ON "exam_questions" ("isArchived");

-- exam_attempts: soft-delete column + indexes
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "exam_attempts_userId_idx" ON "exam_attempts" ("userId");
CREATE INDEX IF NOT EXISTS "exam_attempts_examPaperId_idx" ON "exam_attempts" ("examPaperId");
CREATE INDEX IF NOT EXISTS "exam_attempts_userId_examPaperId_idx" ON "exam_attempts" ("userId", "examPaperId");
CREATE INDEX IF NOT EXISTS "exam_attempts_status_idx" ON "exam_attempts" ("status");
CREATE INDEX IF NOT EXISTS "exam_attempts_deletedAt_idx" ON "exam_attempts" ("deletedAt");

-- exam_grades
CREATE INDEX IF NOT EXISTS "exam_grades_examinerId_idx" ON "exam_grades" ("examinerId");

-- proctoring_sessions
CREATE INDEX IF NOT EXISTS "proctoring_sessions_proctorId_idx" ON "proctoring_sessions" ("proctorId");

-- proctoring_incidents
CREATE INDEX IF NOT EXISTS "proctoring_incidents_sessionId_idx" ON "proctoring_incidents" ("sessionId");

-- certification_decisions
CREATE INDEX IF NOT EXISTS "certification_decisions_certificationOfficerId_idx" ON "certification_decisions" ("certificationOfficerId");

-- certificates: soft-delete column + indexes
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "certificates_userId_idx" ON "certificates" ("userId");
CREATE INDEX IF NOT EXISTS "certificates_schemeId_idx" ON "certificates" ("schemeId");
-- Composite index for cert expiry cron: WHERE status = 'ACTIVE' AND expiresAt BETWEEN x AND y
CREATE INDEX IF NOT EXISTS "certificates_status_expiresAt_idx" ON "certificates" ("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "certificates_deletedAt_idx" ON "certificates" ("deletedAt");

-- certificate_renewals
CREATE INDEX IF NOT EXISTS "certificate_renewals_certificateId_idx" ON "certificate_renewals" ("certificateId");

-- cpd_records
CREATE INDEX IF NOT EXISTS "cpd_records_userId_idx" ON "cpd_records" ("userId");
CREATE INDEX IF NOT EXISTS "cpd_records_schemeId_idx" ON "cpd_records" ("schemeId");
CREATE INDEX IF NOT EXISTS "cpd_records_status_idx" ON "cpd_records" ("status");

-- purchases
CREATE INDEX IF NOT EXISTS "purchases_userId_idx" ON "purchases" ("userId");
CREATE INDEX IF NOT EXISTS "purchases_courseId_idx" ON "purchases" ("courseId");
CREATE INDEX IF NOT EXISTS "purchases_status_idx" ON "purchases" ("status");

-- appeals
CREATE INDEX IF NOT EXISTS "appeals_userId_idx" ON "appeals" ("userId");
CREATE INDEX IF NOT EXISTS "appeals_status_idx" ON "appeals" ("status");

-- complaints
CREATE INDEX IF NOT EXISTS "complaints_userId_idx" ON "complaints" ("userId");
CREATE INDEX IF NOT EXISTS "complaints_status_idx" ON "complaints" ("status");

-- coi_declarations: composite for COI check at cert issuance
CREATE INDEX IF NOT EXISTS "coi_declarations_userId_expiresAt_idx" ON "coi_declarations" ("userId", "expiresAt");

-- consent_records
CREATE INDEX IF NOT EXISTS "consent_records_userId_purpose_idx" ON "consent_records" ("userId", "purpose");

-- data_subject_requests
CREATE INDEX IF NOT EXISTS "data_subject_requests_userId_idx" ON "data_subject_requests" ("userId");
CREATE INDEX IF NOT EXISTS "data_subject_requests_status_idx" ON "data_subject_requests" ("status");
CREATE INDEX IF NOT EXISTS "data_subject_requests_dueAt_idx" ON "data_subject_requests" ("dueAt");

-- breach_incidents
CREATE INDEX IF NOT EXISTS "breach_incidents_status_idx" ON "breach_incidents" ("status");
CREATE INDEX IF NOT EXISTS "breach_incidents_discoveredAt_idx" ON "breach_incidents" ("discoveredAt");

-- notifications
CREATE INDEX IF NOT EXISTS "notifications_userId_read_idx" ON "notifications" ("userId", "read");
CREATE INDEX IF NOT EXISTS "notifications_sentAt_idx" ON "notifications" ("sentAt");

-- notification_logs
CREATE INDEX IF NOT EXISTS "notification_logs_userId_idx" ON "notification_logs" ("userId");
CREATE INDEX IF NOT EXISTS "notification_logs_sentAt_idx" ON "notification_logs" ("sentAt");

-- document_versions
CREATE INDEX IF NOT EXISTS "document_versions_documentId_idx" ON "document_versions" ("documentId");
CREATE INDEX IF NOT EXISTS "document_versions_status_idx" ON "document_versions" ("status");

-- non_conformities
CREATE INDEX IF NOT EXISTS "non_conformities_status_idx" ON "non_conformities" ("status");
CREATE INDEX IF NOT EXISTS "non_conformities_assignedTo_idx" ON "non_conformities" ("assignedTo");

-- corrective_actions
CREATE INDEX IF NOT EXISTS "corrective_actions_nonConformityId_idx" ON "corrective_actions" ("nonConformityId");

-- audit_logs
CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs" ("userId");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "audit_logs_timestamp_idx" ON "audit_logs" ("timestamp");
CREATE INDEX IF NOT EXISTS "audit_logs_entityType_entityId_idx" ON "audit_logs" ("entityType", "entityId");

-- scorm_sessions
CREATE INDEX IF NOT EXISTS "scorm_sessions_packageId_idx" ON "scorm_sessions" ("packageId");
