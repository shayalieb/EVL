-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "allVerticalsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vertical" TEXT NOT NULL DEFAULT 'band_orchestra';

