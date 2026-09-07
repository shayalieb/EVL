CREATE TABLE "QuickBooksPilotTestRun" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "testedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'in_progress',
  "results" JSONB NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuickBooksPilotTestRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuickBooksPilotTestRun_pilotId_startedAt_idx" ON "QuickBooksPilotTestRun"("pilotId", "startedAt");
CREATE INDEX "QuickBooksPilotTestRun_status_startedAt_idx" ON "QuickBooksPilotTestRun"("status", "startedAt");
ALTER TABLE "QuickBooksPilotTestRun" ADD CONSTRAINT "QuickBooksPilotTestRun_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "QuickBooksPilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuickBooksPilotTestRun" ADD CONSTRAINT "QuickBooksPilotTestRun_testedById_fkey" FOREIGN KEY ("testedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

