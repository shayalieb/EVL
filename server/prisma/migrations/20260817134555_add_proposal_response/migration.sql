-- CreateTable
CREATE TABLE "ProposalResponse" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "tokenHash" TEXT,
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "log" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ProposalResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalResponse_tokenHash_key" ON "ProposalResponse"("tokenHash");

-- CreateIndex
CREATE INDEX "ProposalResponse_accountId_bookingId_idx" ON "ProposalResponse"("accountId", "bookingId");

-- AddForeignKey
ALTER TABLE "ProposalResponse" ADD CONSTRAINT "ProposalResponse_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
