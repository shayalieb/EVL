-- CreateTable
CREATE TABLE "InquiryLink" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "recipientEmail" TEXT,
    "recipientName" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "response" JSONB,
    "submittedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "appliedBookingId" TEXT,
    "appliedClientId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InquiryLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InquiryLink_tokenHash_key" ON "InquiryLink"("tokenHash");

-- CreateIndex
CREATE INDEX "InquiryLink_accountId_idx" ON "InquiryLink"("accountId");

-- AddForeignKey
ALTER TABLE "InquiryLink" ADD CONSTRAINT "InquiryLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
