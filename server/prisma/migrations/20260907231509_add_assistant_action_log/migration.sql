-- CreateTable
CREATE TABLE "AssistantAction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantAction_accountId_createdAt_idx" ON "AssistantAction"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantAction" ADD CONSTRAINT "AssistantAction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
