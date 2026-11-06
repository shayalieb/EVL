-- CreateTable
CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT,
    "type" TEXT NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientNote_accountId_clientId_createdAt_idx" ON "ClientNote"("accountId", "clientId", "createdAt");
CREATE INDEX "ClientNote_clientId_pinned_idx" ON "ClientNote"("clientId", "pinned");

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backend-only table: no REST-role exposure.
ALTER TABLE "ClientNote" ENABLE ROW LEVEL SECURITY;

-- Carry each existing free-text note over as a first log entry.
INSERT INTO "ClientNote" ("id", "accountId", "clientId", "authorName", "type", "body", "pinned", "createdAt", "updatedAt")
SELECT 'legacy_' || "id", "accountId", "id", 'Imported', 'general', "notes", false, "updatedAt", "updatedAt"
FROM "Client"
WHERE "notes" IS NOT NULL AND btrim("notes") <> '';
