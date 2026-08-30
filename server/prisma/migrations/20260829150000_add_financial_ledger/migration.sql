CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "groupId" TEXT,
    "bookingId" TEXT,
    "eventId" TEXT,
    "invoiceId" TEXT,
    "contractorId" TEXT,
    "clientId" TEXT,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "memo" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "reversalOfId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialTransaction_reversalOfId_key" ON "FinancialTransaction"("reversalOfId");
CREATE UNIQUE INDEX "FinancialTransaction_accountId_sourceType_sourceId_key" ON "FinancialTransaction"("accountId", "sourceType", "sourceId");
CREATE INDEX "FinancialTransaction_accountId_occurredAt_idx" ON "FinancialTransaction"("accountId", "occurredAt");
CREATE INDEX "FinancialTransaction_accountId_bookingId_occurredAt_idx" ON "FinancialTransaction"("accountId", "bookingId", "occurredAt");
CREATE INDEX "FinancialTransaction_accountId_eventId_occurredAt_idx" ON "FinancialTransaction"("accountId", "eventId", "occurredAt");
CREATE INDEX "FinancialTransaction_accountId_groupId_occurredAt_idx" ON "FinancialTransaction"("accountId", "groupId", "occurredAt");
CREATE INDEX "FinancialTransaction_accountId_contractorId_occurredAt_idx" ON "FinancialTransaction"("accountId", "contractorId", "occurredAt");

ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AgencyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing recorded invoice payments become opening ledger entries. Their
-- stored paidAmount is the authoritative historical amount available today.
INSERT INTO "FinancialTransaction" (
  "id", "accountId", "bookingId", "invoiceId", "clientId", "category",
  "amountCents", "currency", "description", "occurredAt", "sourceType",
  "sourceId", "paymentMethod", "reference", "memo", "metadata", "createdAt"
)
SELECT
  'ft_' || i."id", i."accountId", i."bookingId", i."id", b."clientId", 'client_payment',
  ROUND(i."paidAmount" * 100)::INTEGER, 'USD',
  'Opening payment balance for invoice #' || COALESCE(i."number"::TEXT, i."id"),
  COALESCE(i."paidAt", i."updatedAt"), 'invoice_opening', i."id",
  i."paymentMethod", i."paymentReference", i."paymentMemo", '{}', COALESCE(i."paidAt", i."updatedAt")
FROM "Invoice" i
LEFT JOIN "Booking" b ON b."id" = i."bookingId" AND b."accountId" = i."accountId"
WHERE COALESCE(i."paidAmount", 0) > 0;

UPDATE "FinancialTransaction" ft
SET "groupId" = b."groupId"
FROM "Booking" b
WHERE ft."bookingId" = b."id" AND ft."accountId" = b."accountId";
