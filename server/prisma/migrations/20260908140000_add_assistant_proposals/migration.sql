CREATE TABLE "AssistantProposal" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "fields" JSONB NOT NULL,
  "candidates" JSONB NOT NULL DEFAULT '[]',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistantProposal_accountId_userId_expiresAt_idx" ON "AssistantProposal"("accountId", "userId", "expiresAt");
CREATE INDEX "AssistantProposal_expiresAt_usedAt_idx" ON "AssistantProposal"("expiresAt", "usedAt");
ALTER TABLE "AssistantProposal" ADD CONSTRAINT "AssistantProposal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

