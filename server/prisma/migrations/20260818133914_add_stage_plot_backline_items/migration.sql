-- CreateTable
CREATE TABLE "StagePlotBacklineItem" (
    "id" TEXT NOT NULL,
    "stagePlotId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "providedBy" TEXT,
    "notesHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagePlotBacklineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StagePlotBacklineItem_stagePlotId_idx" ON "StagePlotBacklineItem"("stagePlotId");

-- AddForeignKey
ALTER TABLE "StagePlotBacklineItem" ADD CONSTRAINT "StagePlotBacklineItem_stagePlotId_fkey" FOREIGN KEY ("stagePlotId") REFERENCES "StagePlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
