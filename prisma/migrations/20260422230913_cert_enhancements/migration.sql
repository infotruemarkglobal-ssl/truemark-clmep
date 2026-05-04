-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_permissionId_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_roleId_fkey";

-- DropForeignKey
ALTER TABLE "user_custom_roles" DROP CONSTRAINT "user_custom_roles_roleId_fkey";

-- DropForeignKey
ALTER TABLE "user_custom_roles" DROP CONSTRAINT "user_custom_roles_userId_fkey";

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "candidate_employer_snapshot" TEXT,
ADD COLUMN     "exam_paper_title_snapshot" TEXT;

-- AlterTable
ALTER TABLE "certification_schemes" ADD COLUMN     "standardVersion" TEXT DEFAULT 'ISO/IEC 17024:2012';

-- AlterTable
ALTER TABLE "custom_roles" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "exam_responses" ADD COLUMN     "questionMarksSnapshot" INTEGER,
ADD COLUMN     "questionOptionsSnapshot" TEXT,
ADD COLUMN     "questionTextSnapshot" TEXT,
ADD COLUMN     "questionVersionSnapshot" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signatureUrl" TEXT;

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "custom_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_custom_roles" ADD CONSTRAINT "user_custom_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_custom_roles" ADD CONSTRAINT "user_custom_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "custom_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
