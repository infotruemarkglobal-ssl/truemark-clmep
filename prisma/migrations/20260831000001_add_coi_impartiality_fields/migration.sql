-- AlterTable
ALTER TABLE "coi_declarations"
  ADD COLUMN "subjectUserId" TEXT,
  ADD COLUMN "riskLevel" TEXT NOT NULL DEFAULT 'LOW';

-- CreateIndex
CREATE INDEX "coi_declarations_subjectUserId_idx" ON "coi_declarations"("subjectUserId");

-- AddForeignKey
ALTER TABLE "coi_declarations" ADD CONSTRAINT "coi_declarations_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
