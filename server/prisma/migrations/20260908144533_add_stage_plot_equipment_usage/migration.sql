-- CreateTable
CREATE TABLE "StagePlotEquipmentUsage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "stagePlotId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StagePlotEquipmentUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StagePlotEquipmentUsage_accountId_createdAt_idx" ON "StagePlotEquipmentUsage"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "StagePlotEquipmentUsage_stagePlotId_idx" ON "StagePlotEquipmentUsage"("stagePlotId");

-- AddForeignKey
ALTER TABLE "StagePlotEquipmentUsage" ADD CONSTRAINT "StagePlotEquipmentUsage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePlotEquipmentUsage" ADD CONSTRAINT "StagePlotEquipmentUsage_stagePlotId_fkey" FOREIGN KEY ("stagePlotId") REFERENCES "StagePlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
