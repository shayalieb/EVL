-- AlterTable
ALTER TABLE "ContractorCalendarLink" ADD COLUMN     "showConfirmed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showTentative" BOOLEAN NOT NULL DEFAULT true;
