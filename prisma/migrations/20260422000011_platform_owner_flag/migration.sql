-- Migration: 20260422000011_platform_owner_flag
--
-- Adds isPlatformOwner flag to organisations.
-- Exactly one row should have this set to true: TrueMark Global (the platform itself).
-- This distinguishes the platform owner from client organisations in listings and queries.

ALTER TABLE "organisations"
  ADD COLUMN "isPlatformOwner" BOOLEAN NOT NULL DEFAULT false;

-- Partial unique index: only one org may be the platform owner at a time.
CREATE UNIQUE INDEX "organisations_platform_owner_unique"
  ON "organisations" ("isPlatformOwner")
  WHERE "isPlatformOwner" = true;
