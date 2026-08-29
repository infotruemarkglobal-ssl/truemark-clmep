-- Tier 1: org-scoped custom roles.
-- organisationId: null = platform-wide (today's behavior, unchanged for every
-- existing row); set = the grant applies only within that one organisation.
--
-- Switches UserCustomRole's primary key from (userId, roleId) to a surrogate
-- id, since the same (user, role) pair must now be assignable more than once
-- (e.g. the same custom role granted for Org A and, separately, Org B).
--
-- Hand-adjusted from the raw `prisma migrate diff` output: that output emits
-- `ADD COLUMN "id" TEXT NOT NULL` with no default, which is only safe against
-- an empty table (true of the shadow DB used to compute the diff, not
-- necessarily true of any real database this runs against, most importantly
-- production). Adds the column nullable, backfills existing rows, then
-- constrains it — safe whether the table is empty or populated.

-- AlterTable
ALTER TABLE "user_custom_roles" DROP CONSTRAINT "user_custom_roles_pkey";

ALTER TABLE "user_custom_roles" ADD COLUMN "id" TEXT;
UPDATE "user_custom_roles" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "user_custom_roles" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "user_custom_roles" ADD COLUMN "organisationId" TEXT;

ALTER TABLE "user_custom_roles" ADD CONSTRAINT "user_custom_roles_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "user_custom_roles_userId_idx" ON "user_custom_roles"("userId");

-- CreateIndex
CREATE INDEX "user_custom_roles_organisationId_idx" ON "user_custom_roles"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "user_custom_roles_userId_roleId_organisationId_key" ON "user_custom_roles"("userId", "roleId", "organisationId");

-- AddForeignKey
ALTER TABLE "user_custom_roles" ADD CONSTRAINT "user_custom_roles_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
