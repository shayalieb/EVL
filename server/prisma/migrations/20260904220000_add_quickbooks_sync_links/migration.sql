CREATE TABLE "QuickBooksEntityLink" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "localId" TEXT NOT NULL,
  "quickBooksId" TEXT,
  "quickBooksSyncToken" TEXT,
  "displayName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "lastError" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuickBooksEntityLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuickBooksSyncLog" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "localId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuickBooksSyncLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuickBooksEntityLink_accountId_entityType_localId_key" ON "QuickBooksEntityLink"("accountId", "entityType", "localId");
CREATE UNIQUE INDEX "QuickBooksEntityLink_accountId_entityType_quickBooksId_key" ON "QuickBooksEntityLink"("accountId", "entityType", "quickBooksId");
CREATE INDEX "QuickBooksEntityLink_accountId_entityType_status_idx" ON "QuickBooksEntityLink"("accountId", "entityType", "status");
CREATE INDEX "QuickBooksSyncLog_accountId_createdAt_idx" ON "QuickBooksSyncLog"("accountId", "createdAt");
CREATE INDEX "QuickBooksSyncLog_accountId_entityType_localId_idx" ON "QuickBooksSyncLog"("accountId", "entityType", "localId");
