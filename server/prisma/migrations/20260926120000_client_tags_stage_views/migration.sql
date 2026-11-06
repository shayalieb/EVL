-- AlterTable
ALTER TABLE "Client" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "stage" TEXT;

-- CreateIndex
CREATE INDEX "Client_accountId_stage_idx" ON "Client"("accountId", "stage");

-- CreateTable
CREATE TABLE "ClientSavedView" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientSavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientSavedView_accountId_name_key" ON "ClientSavedView"("accountId", "name");
CREATE INDEX "ClientSavedView_accountId_idx" ON "ClientSavedView"("accountId");

-- Backend-only table: no REST-role exposure.
ALTER TABLE "ClientSavedView" ENABLE ROW LEVEL SECURITY;
