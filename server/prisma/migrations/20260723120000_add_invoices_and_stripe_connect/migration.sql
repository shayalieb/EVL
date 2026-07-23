-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "dueDate" TIMESTAMP(3),
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "payTokenHash" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_stripeAccountId_key" ON "Account"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_payTokenHash_key" ON "Invoice"("payTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeCheckoutSessionId_key" ON "Invoice"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "Invoice_accountId_bookingId_idx" ON "Invoice"("accountId", "bookingId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
