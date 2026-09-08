-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "designPartnerExpiryNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "freeAccessExpiresAt" TIMESTAMP(3);
