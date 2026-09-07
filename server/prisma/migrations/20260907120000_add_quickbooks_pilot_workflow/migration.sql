CREATE TABLE "QuickBooksPilot" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'onboarding',
  "supportStatus" TEXT NOT NULL DEFAULT 'open',
  "ownerUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "nextFollowUpAt" TIMESTAMP(3),
  "feedback" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuickBooksPilot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickBooksPilot_accountId_key" ON "QuickBooksPilot"("accountId");
CREATE INDEX "QuickBooksPilot_status_supportStatus_idx" ON "QuickBooksPilot"("status", "supportStatus");
CREATE INDEX "QuickBooksPilot_ownerUserId_idx" ON "QuickBooksPilot"("ownerUserId");
CREATE INDEX "QuickBooksPilot_nextFollowUpAt_idx" ON "QuickBooksPilot"("nextFollowUpAt");

ALTER TABLE "QuickBooksPilot" ADD CONSTRAINT "QuickBooksPilot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuickBooksPilot" ADD CONSTRAINT "QuickBooksPilot_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

