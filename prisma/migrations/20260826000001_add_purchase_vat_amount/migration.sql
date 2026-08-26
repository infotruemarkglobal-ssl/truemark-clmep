-- AlterTable
-- Persists the VAT charged per purchase, which was previously computed at checkout
-- and included in the amount sent to Paystack but never stored — leaving no
-- historical accounting record of how much VAT was actually collected per
-- transaction. Existing rows default to 0 (unknown/unrecorded), matching their
-- true prior state; new purchases populate this going forward.
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
