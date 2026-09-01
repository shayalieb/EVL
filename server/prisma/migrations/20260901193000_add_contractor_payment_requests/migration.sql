CREATE TABLE "ContractorPaymentRequest" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "contractorId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "invoiceNumber" TEXT,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractorPaymentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractorPaymentRequest_eventId_contractorId_key" ON "ContractorPaymentRequest"("eventId", "contractorId");
CREATE INDEX "ContractorPaymentRequest_accountId_status_submittedAt_idx" ON "ContractorPaymentRequest"("accountId", "status", "submittedAt");
CREATE INDEX "ContractorPaymentRequest_contractorId_submittedAt_idx" ON "ContractorPaymentRequest"("contractorId", "submittedAt");
ALTER TABLE "ContractorPaymentRequest" ADD CONSTRAINT "ContractorPaymentRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorPaymentRequest" ADD CONSTRAINT "ContractorPaymentRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorPaymentRequest" ADD CONSTRAINT "ContractorPaymentRequest_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
