-- AlterTable
-- Adds the exam-only course fields that were added to schema.prisma but never
-- migrated into the database (schema drift caused production `course.findMany()`
-- calls to fail with "column courses.examOnly does not exist").
-- Guarded with IF NOT EXISTS / a constraint check so this is safe to run against
-- environments where the columns may already have been added out-of-band.
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "examOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "examPaperId" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_examPaperId_fkey'
  ) THEN
    ALTER TABLE "courses" ADD CONSTRAINT "courses_examPaperId_fkey" FOREIGN KEY ("examPaperId") REFERENCES "exam_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
