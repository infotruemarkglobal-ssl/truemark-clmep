-- Preferred UI language for authenticated requests (next-intl). Nullable,
-- no default and no backfill needed — null just falls through to the
-- anonymous-visitor locale cookie / "en" default in src/i18n/request.ts.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" VARCHAR(10);
