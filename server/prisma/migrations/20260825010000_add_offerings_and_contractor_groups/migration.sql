-- CreateTable
CREATE TABLE "Offering" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" TEXT,
    "type" TEXT NOT NULL,
    "amount" TEXT,
    "unitCount" TEXT,
    "ratePerUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Offering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorGroup" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contractorIds" JSONB NOT NULL DEFAULT '[]',
    "price" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContractorGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Offering_accountId_idx" ON "Offering"("accountId");
CREATE INDEX "Offering_accountId_createdAt_id_idx" ON "Offering"("accountId", "createdAt", "id");
CREATE INDEX "ContractorGroup_accountId_idx" ON "ContractorGroup"("accountId");
CREATE INDEX "ContractorGroup_accountId_createdAt_id_idx" ON "ContractorGroup"("accountId", "createdAt", "id");

ALTER TABLE "Offering" ADD CONSTRAINT "Offering_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorGroup" ADD CONSTRAINT "ContractorGroup_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
