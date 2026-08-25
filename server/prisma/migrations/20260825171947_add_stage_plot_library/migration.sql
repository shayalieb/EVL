-- CreateTable
CREATE TABLE "StagePlotLibraryItem" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Stage Plot',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagePlotLibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagePlotLibraryPage" (
    "id" TEXT NOT NULL,
    "libraryItemId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Page 1',
    "scene" JSONB NOT NULL DEFAULT '{}',
    "thumbnailStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagePlotLibraryPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagePlotLibraryChannel" (
    "id" TEXT NOT NULL,
    "libraryItemId" TEXT NOT NULL,
    "channelNumber" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "musicianName" TEXT,
    "phantomPower" BOOLEAN NOT NULL DEFAULT false,
    "powerNeeded" BOOLEAN NOT NULL DEFAULT false,
    "monitorNotes" TEXT,
    "elementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagePlotLibraryChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagePlotLibraryBacklineItem" (
    "id" TEXT NOT NULL,
    "libraryItemId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "providedBy" TEXT,
    "notesHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagePlotLibraryBacklineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StagePlotLibraryItem_accountId_idx" ON "StagePlotLibraryItem"("accountId");

-- CreateIndex
CREATE INDEX "StagePlotLibraryItem_accountId_createdAt_id_idx" ON "StagePlotLibraryItem"("accountId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StagePlotLibraryPage_libraryItemId_order_key" ON "StagePlotLibraryPage"("libraryItemId", "order");

-- CreateIndex
CREATE INDEX "StagePlotLibraryChannel_libraryItemId_idx" ON "StagePlotLibraryChannel"("libraryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StagePlotLibraryChannel_libraryItemId_channelNumber_key" ON "StagePlotLibraryChannel"("libraryItemId", "channelNumber");

-- CreateIndex
CREATE INDEX "StagePlotLibraryBacklineItem_libraryItemId_idx" ON "StagePlotLibraryBacklineItem"("libraryItemId");

-- AddForeignKey
ALTER TABLE "StagePlotLibraryItem" ADD CONSTRAINT "StagePlotLibraryItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePlotLibraryPage" ADD CONSTRAINT "StagePlotLibraryPage_libraryItemId_fkey" FOREIGN KEY ("libraryItemId") REFERENCES "StagePlotLibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePlotLibraryChannel" ADD CONSTRAINT "StagePlotLibraryChannel_libraryItemId_fkey" FOREIGN KEY ("libraryItemId") REFERENCES "StagePlotLibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePlotLibraryBacklineItem" ADD CONSTRAINT "StagePlotLibraryBacklineItem_libraryItemId_fkey" FOREIGN KEY ("libraryItemId") REFERENCES "StagePlotLibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
