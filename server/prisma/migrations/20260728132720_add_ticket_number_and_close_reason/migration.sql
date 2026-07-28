-- AlterTable
ALTER TABLE "SupportThread" ADD COLUMN     "closedReason" TEXT,
ADD COLUMN     "closedReasonDetail" TEXT,
ADD COLUMN     "ticketNumber" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SupportThread_ticketNumber_key" ON "SupportThread"("ticketNumber");

