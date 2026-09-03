/*
  Warnings:

  - You are about to drop the column `smsConsentStatus` on the `Contractor` table. All the data in the column will be lost.
  - You are about to drop the column `smsConsentedAt` on the `Contractor` table. All the data in the column will be lost.
  - You are about to drop the column `smsOptedOutAt` on the `Contractor` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappConsentStatus` on the `Contractor` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappConsentedAt` on the `Contractor` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappOptedOutAt` on the `Contractor` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "previousContractId" TEXT,
ADD COLUMN     "revisionNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Contractor" DROP COLUMN "smsConsentStatus",
DROP COLUMN "smsConsentedAt",
DROP COLUMN "smsOptedOutAt",
DROP COLUMN "whatsappConsentStatus",
DROP COLUMN "whatsappConsentedAt",
DROP COLUMN "whatsappOptedOutAt";

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "smsConsentStatus" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "smsConsentedAt" TIMESTAMP(3),
ADD COLUMN     "smsOptedOutAt" TIMESTAMP(3),
ADD COLUMN     "whatsappConsentStatus" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "whatsappConsentedAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOptedOutAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_previousContractId_fkey" FOREIGN KEY ("previousContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
