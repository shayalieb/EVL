-- CreateTable
CREATE TABLE "StagePlot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Stage Plot',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagePlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagePlotPage" (
    "id" TEXT NOT NULL,
    "stagePlotId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Page 1',
    "scene" JSONB NOT NULL DEFAULT '{}',
    "thumbnailStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagePlotPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagePlotChannel" (
    "id" TEXT NOT NULL,
    "stagePlotId" TEXT NOT NULL,
    "channelNumber" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "micOrDi" TEXT,
    "standType" TEXT,
    "phantomPower" BOOLEAN NOT NULL DEFAULT false,
    "monitorNotes" TEXT,
    "elementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagePlotChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StagePlot_accountId_idx" ON "StagePlot"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "StagePlot_accountId_eventId_key" ON "StagePlot"("accountId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "StagePlotPage_stagePlotId_order_key" ON "StagePlotPage"("stagePlotId", "order");

-- CreateIndex
CREATE INDEX "StagePlotChannel_stagePlotId_idx" ON "StagePlotChannel"("stagePlotId");

-- CreateIndex
CREATE UNIQUE INDEX "StagePlotChannel_stagePlotId_channelNumber_key" ON "StagePlotChannel"("stagePlotId", "channelNumber");

-- AddForeignKey
ALTER TABLE "StagePlot" ADD CONSTRAINT "StagePlot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePlotPage" ADD CONSTRAINT "StagePlotPage_stagePlotId_fkey" FOREIGN KEY ("stagePlotId") REFERENCES "StagePlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePlotChannel" ADD CONSTRAINT "StagePlotChannel_stagePlotId_fkey" FOREIGN KEY ("stagePlotId") REFERENCES "StagePlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

