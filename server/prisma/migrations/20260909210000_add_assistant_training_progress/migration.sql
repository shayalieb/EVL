CREATE TABLE "AssistantTrainingProgress" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "guideId" TEXT NOT NULL,
  "completedSteps" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "completedAt" TIMESTAMP(3),
  "dismissedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssistantTrainingProgress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssistantTrainingProgress_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssistantTrainingProgress_accountId_userId_guideId_key" ON "AssistantTrainingProgress"("accountId", "userId", "guideId");
CREATE INDEX "AssistantTrainingProgress_accountId_userId_idx" ON "AssistantTrainingProgress"("accountId", "userId");
ALTER TABLE "AssistantTrainingProgress" ENABLE ROW LEVEL SECURITY;
