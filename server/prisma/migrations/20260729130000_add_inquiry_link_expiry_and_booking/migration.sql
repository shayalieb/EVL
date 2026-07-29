-- AlterTable
ALTER TABLE "InquiryLink" ADD COLUMN "bookingId" TEXT;
ALTER TABLE "InquiryLink" ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + interval '30 days');
ALTER TABLE "InquiryLink" ALTER COLUMN "expiresAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "InquiryLink_accountId_bookingId_idx" ON "InquiryLink"("accountId", "bookingId");
