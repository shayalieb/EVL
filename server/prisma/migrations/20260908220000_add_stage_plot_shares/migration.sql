CREATE TABLE "StagePlotShare" (
  "id" TEXT NOT NULL,
  "stagePlotId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "publicToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastViewedAt" TIMESTAMP(3),
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StagePlotShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StagePlotShare_stagePlotId_key" ON "StagePlotShare"("stagePlotId");
CREATE UNIQUE INDEX "StagePlotShare_tokenHash_key" ON "StagePlotShare"("tokenHash");
CREATE UNIQUE INDEX "StagePlotShare_publicToken_key" ON "StagePlotShare"("publicToken");
CREATE INDEX "StagePlotShare_expiresAt_idx" ON "StagePlotShare"("expiresAt");
ALTER TABLE "StagePlotShare" ADD CONSTRAINT "StagePlotShare_stagePlotId_fkey" FOREIGN KEY ("stagePlotId") REFERENCES "StagePlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StagePlotShare" ENABLE ROW LEVEL SECURITY;
