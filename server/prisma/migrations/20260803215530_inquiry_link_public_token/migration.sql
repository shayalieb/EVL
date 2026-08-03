-- AlterTable
ALTER TABLE "InquiryLink" ADD COLUMN     "publicToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InquiryLink_publicToken_key" ON "InquiryLink"("publicToken");

