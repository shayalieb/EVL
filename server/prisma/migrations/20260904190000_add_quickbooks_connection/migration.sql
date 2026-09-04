CREATE TABLE "QuickBooksConnection" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "realmId" TEXT NOT NULL,
  "companyName" TEXT,
  "country" TEXT,
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT NOT NULL,
  "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "connectedByUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastHealthCheckAt" TIMESTAMP(3),
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuickBooksConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickBooksConnection_accountId_key" ON "QuickBooksConnection"("accountId");
CREATE UNIQUE INDEX "QuickBooksConnection_realmId_key" ON "QuickBooksConnection"("realmId");
CREATE INDEX "QuickBooksConnection_status_idx" ON "QuickBooksConnection"("status");
ALTER TABLE "QuickBooksConnection" ADD CONSTRAINT "QuickBooksConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
