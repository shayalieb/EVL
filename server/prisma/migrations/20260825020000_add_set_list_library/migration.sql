CREATE TABLE "SetListLibraryItem" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "eventIds" JSONB NOT NULL DEFAULT '[]',
    "searchText" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "lastSentCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SetListLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SetListLibraryItem_accountId_idx" ON "SetListLibraryItem"("accountId");
CREATE INDEX "SetListLibraryItem_accountId_createdAt_id_idx" ON "SetListLibraryItem"("accountId", "createdAt", "id");

ALTER TABLE "SetListLibraryItem" ADD CONSTRAINT "SetListLibraryItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
