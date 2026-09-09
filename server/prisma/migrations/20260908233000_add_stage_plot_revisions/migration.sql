ALTER TABLE "StagePlotShare" ADD COLUMN "publishedRevisionNumber" INTEGER;

CREATE TABLE "StagePlotRevision" (
  "id" TEXT NOT NULL,
  "stagePlotId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "note" TEXT,
  "publishedByName" TEXT,
  "snapshot" JSONB NOT NULL,
  "thumbnailKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "summary" JSONB NOT NULL DEFAULT '{}',
  "contentUpdatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StagePlotRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StagePlotRevision_stagePlotId_revisionNumber_key" ON "StagePlotRevision"("stagePlotId", "revisionNumber");
CREATE INDEX "StagePlotRevision_stagePlotId_publishedAt_idx" ON "StagePlotRevision"("stagePlotId", "publishedAt");
ALTER TABLE "StagePlotRevision" ADD CONSTRAINT "StagePlotRevision_stagePlotId_fkey" FOREIGN KEY ("stagePlotId") REFERENCES "StagePlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StagePlotRevision" ENABLE ROW LEVEL SECURITY;
