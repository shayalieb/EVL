-- AlterTable
ALTER TABLE "BookingDocument" ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EventDocument" ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "emailClaimedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SupportAttachment" ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

