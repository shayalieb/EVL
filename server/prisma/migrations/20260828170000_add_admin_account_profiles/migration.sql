CREATE TABLE "AccountAdminNote" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountAdminNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountActivity" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountAdminNote_accountId_createdAt_idx" ON "AccountAdminNote"("accountId", "createdAt");
CREATE INDEX "AccountAdminNote_accountId_pinned_idx" ON "AccountAdminNote"("accountId", "pinned");
CREATE INDEX "AccountAdminNote_followUpAt_idx" ON "AccountAdminNote"("followUpAt");
CREATE INDEX "AccountActivity_accountId_createdAt_idx" ON "AccountActivity"("accountId", "createdAt");
CREATE INDEX "AccountActivity_type_createdAt_idx" ON "AccountActivity"("type", "createdAt");

ALTER TABLE "AccountAdminNote" ADD CONSTRAINT "AccountAdminNote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountAdminNote" ADD CONSTRAINT "AccountAdminNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountActivity" ADD CONSTRAINT "AccountActivity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountActivity" ADD CONSTRAINT "AccountActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
