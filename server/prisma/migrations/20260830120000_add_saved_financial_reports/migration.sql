CREATE TABLE "SavedFinancialReport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportTab" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedFinancialReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedFinancialReport_userId_name_key" ON "SavedFinancialReport"("userId", "name");
CREATE INDEX "SavedFinancialReport_accountId_userId_updatedAt_idx" ON "SavedFinancialReport"("accountId", "userId", "updatedAt");
ALTER TABLE "SavedFinancialReport" ADD CONSTRAINT "SavedFinancialReport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedFinancialReport" ADD CONSTRAINT "SavedFinancialReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
