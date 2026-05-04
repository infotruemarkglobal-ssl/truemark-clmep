-- Migration: 20260422000007_purchase_owner_check
-- Every purchase must belong to either a user OR an organisation (or both).
-- A row with both NULL means the payment can never be attributed to anyone —
-- money received but no enrolment granted. This constraint makes that impossible.

ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_owner_not_null"
  CHECK ("userId" IS NOT NULL OR "organisationId" IS NOT NULL);
