-- CreateTable
CREATE TABLE "ContractorCalendarLink" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorCalendarLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractorCalendarLink_tokenHash_key" ON "ContractorCalendarLink"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorCalendarLink_publicToken_key" ON "ContractorCalendarLink"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorCalendarLink_accountId_contractorId_key" ON "ContractorCalendarLink"("accountId", "contractorId");

-- AddForeignKey
ALTER TABLE "ContractorCalendarLink" ADD CONSTRAINT "ContractorCalendarLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
