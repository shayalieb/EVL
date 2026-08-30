CREATE TABLE "FinancialBudget" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "groupId" TEXT,
    "groupKey" TEXT NOT NULL DEFAULT 'account',
    "month" TEXT NOT NULL,
    "revenueTargetCents" INTEGER NOT NULL DEFAULT 0,
    "expenseBudgetCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialBudget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialBudget_accountId_groupKey_month_key" ON "FinancialBudget"("accountId", "groupKey", "month");
CREATE INDEX "FinancialBudget_accountId_month_idx" ON "FinancialBudget"("accountId", "month");
ALTER TABLE "FinancialBudget" ADD CONSTRAINT "FinancialBudget_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialBudget" ADD CONSTRAINT "FinancialBudget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AgencyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
