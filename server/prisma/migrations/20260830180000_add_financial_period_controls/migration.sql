CREATE TABLE "FinancialPeriod" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "groupId" TEXT,
    "groupKey" TEXT NOT NULL DEFAULT 'account',
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'closed',
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialPeriod_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FinancialPeriodActivity" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialPeriodActivity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialPeriod_accountId_groupKey_month_key" ON "FinancialPeriod"("accountId", "groupKey", "month");
CREATE INDEX "FinancialPeriod_accountId_month_idx" ON "FinancialPeriod"("accountId", "month");
CREATE INDEX "FinancialPeriodActivity_accountId_createdAt_idx" ON "FinancialPeriodActivity"("accountId", "createdAt");
CREATE INDEX "FinancialPeriodActivity_periodId_createdAt_idx" ON "FinancialPeriodActivity"("periodId", "createdAt");
ALTER TABLE "FinancialPeriod" ADD CONSTRAINT "FinancialPeriod_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialPeriod" ADD CONSTRAINT "FinancialPeriod_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AgencyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialPeriod" ADD CONSTRAINT "FinancialPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialPeriodActivity" ADD CONSTRAINT "FinancialPeriodActivity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialPeriodActivity" ADD CONSTRAINT "FinancialPeriodActivity_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancialPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialPeriodActivity" ADD CONSTRAINT "FinancialPeriodActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
