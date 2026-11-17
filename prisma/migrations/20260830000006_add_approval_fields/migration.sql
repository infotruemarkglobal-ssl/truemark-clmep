-- AlterTable
ALTER TABLE "exam_papers"
  ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "certification_schemes"
  ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

-- Backfill: papers/schemes already live in production were vetted before
-- this gate existed — treat them as already-approved (approver unknown/
-- historical) rather than silently reclassifying live content as DRAFT.
UPDATE "exam_papers" SET "approvalStatus" = 'APPROVED', "approvedAt" = now() WHERE "isActive" = true;
UPDATE "certification_schemes" SET "approvalStatus" = 'APPROVED', "approvedAt" = now() WHERE "isActive" = true;

