-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "clientTokenHash" TEXT,
    "ownerTokenHash" TEXT,
    "clientSignedAt" TIMESTAMP(3),
    "clientSignatureName" TEXT,
    "clientSignatureImage" TEXT,
    "ownerSignedAt" TIMESTAMP(3),
    "ownerSignatureName" TEXT,
    "ownerSignatureImage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_clientTokenHash_key" ON "Contract"("clientTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_ownerTokenHash_key" ON "Contract"("ownerTokenHash");

-- CreateIndex
CREATE INDEX "Contract_accountId_bookingId_idx" ON "Contract"("accountId", "bookingId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
