-- Practice exams: unlimited attempts, never proctored, never eligible for
-- certification decisions. Single additive column with a default — safe
-- against a populated table, no backfill needed.

-- AlterTable
ALTER TABLE "exam_papers" ADD COLUMN     "isPractice" BOOLEAN NOT NULL DEFAULT false;
