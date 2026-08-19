/*
  Warnings:

  - You are about to drop the column `micOrDi` on the `StagePlotChannel` table. All the data in the column will be lost.
  - You are about to drop the column `standType` on the `StagePlotChannel` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "StagePlotChannel" DROP COLUMN "micOrDi",
DROP COLUMN "standType",
ADD COLUMN     "musicianName" TEXT,
ADD COLUMN     "powerNeeded" BOOLEAN NOT NULL DEFAULT false;
