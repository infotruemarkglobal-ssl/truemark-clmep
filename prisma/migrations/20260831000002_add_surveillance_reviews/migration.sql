-- AlterTable
ALTER TABLE "certification_schemes"
  ADD COLUMN "surveillanceRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "surveillanceIntervalMonths" INTEGER;

-- CreateTable
CREATE TABLE "surveillance_reviews" (
  "id"            TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "riskLevel"     TEXT NOT NULL DEFAULT 'LOW',
  "reason"        TEXT,
  "status"        TEXT NOT NULL DEFAULT 'SCHEDULED',
  "scheduledFor"  TIMESTAMP(3) NOT NULL,
  "completedAt"   TIMESTAMP(3),
  "reviewerId"    TEXT,
  "findings"      TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "surveillance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "surveillance_reviews_certificateId_idx" ON "surveillance_reviews"("certificateId");
CREATE INDEX "surveillance_reviews_status_idx" ON "surveillance_reviews"("status");
CREATE INDEX "surveillance_reviews_scheduledFor_idx" ON "surveillance_reviews"("scheduledFor");

-- AddForeignKey
ALTER TABLE "surveillance_reviews" ADD CONSTRAINT "surveillance_reviews_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "surveillance_reviews" ADD CONSTRAINT "surveillance_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "surveillance_reviews" ADD CONSTRAINT "surveillance_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
