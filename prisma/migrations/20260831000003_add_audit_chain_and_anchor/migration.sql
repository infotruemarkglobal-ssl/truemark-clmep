-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "previous_hash" TEXT;

-- CreateTable
CREATE TABLE "audit_anchors" (
  "id"            TEXT NOT NULL,
  "digestHash"    TEXT NOT NULL,
  "chainTipLogId" TEXT NOT NULL,
  "tsaUrl"        TEXT NOT NULL,
  "tsaToken"      TEXT NOT NULL,
  "tsaGenTime"    TIMESTAMP(3) NOT NULL,
  "tsaSerial"     TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_anchors_createdAt_idx" ON "audit_anchors"("createdAt");
