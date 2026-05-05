ALTER TABLE "appeals" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "appeals_dueAt_idx" ON "appeals"("dueAt");
