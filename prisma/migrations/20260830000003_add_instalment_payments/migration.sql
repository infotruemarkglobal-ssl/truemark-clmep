-- Instalment payments: Paystack has no BNPL product, so "instalments" means
-- storing the reusable card authorization from the first payment and
-- charging it again later via POST /transaction/charge_authorization.
-- All additive/nullable against Purchase — safe against a populated table.

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "paystackAuthorizationCode" TEXT;
ALTER TABLE "purchases" ADD COLUMN     "paystackAuthorizationJson" TEXT;
ALTER TABLE "purchases" ADD COLUMN     "isInstalment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "instalment_plans" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "numberOfInstalments" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instalment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instalment_charges" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "instalmentNumber" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "paystackReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instalment_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instalment_plans_purchaseId_key" ON "instalment_plans"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "instalment_charges_paystackReference_key" ON "instalment_charges"("paystackReference");

-- CreateIndex
CREATE INDEX "instalment_charges_status_dueDate_idx" ON "instalment_charges"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "instalment_charges_planId_instalmentNumber_key" ON "instalment_charges"("planId", "instalmentNumber");

-- AddForeignKey
ALTER TABLE "instalment_plans" ADD CONSTRAINT "instalment_plans_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instalment_charges" ADD CONSTRAINT "instalment_charges_planId_fkey" FOREIGN KEY ("planId") REFERENCES "instalment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
