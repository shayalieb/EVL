-- AlterTable
ALTER TABLE "EventDocument" ADD COLUMN "shareTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EventDocument_shareTokenHash_key" ON "EventDocument"("shareTokenHash");
