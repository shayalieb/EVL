-- AlterTable
ALTER TABLE "StagePlotRevision" ALTER COLUMN "thumbnailKeys" DROP DEFAULT;

-- CreateTable
CREATE TABLE "RunOfShowLibraryItem" (
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

    CONSTRAINT "RunOfShowLibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunOfShowShare" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunOfShowShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunOfShowLibraryItem_accountId_idx" ON "RunOfShowLibraryItem"("accountId");

-- CreateIndex
CREATE INDEX "RunOfShowLibraryItem_accountId_createdAt_id_idx" ON "RunOfShowLibraryItem"("accountId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RunOfShowShare_eventId_key" ON "RunOfShowShare"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "RunOfShowShare_tokenHash_key" ON "RunOfShowShare"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RunOfShowShare_publicToken_key" ON "RunOfShowShare"("publicToken");

-- CreateIndex
CREATE INDEX "RunOfShowShare_expiresAt_idx" ON "RunOfShowShare"("expiresAt");

-- AddForeignKey
ALTER TABLE "RunOfShowLibraryItem" ADD CONSTRAINT "RunOfShowLibraryItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunOfShowShare" ADD CONSTRAINT "RunOfShowShare_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
