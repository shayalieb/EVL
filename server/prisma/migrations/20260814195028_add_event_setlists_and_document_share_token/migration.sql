-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "setLists" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "EventDocument" ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EventDocument_shareToken_key" ON "EventDocument"("shareToken");

