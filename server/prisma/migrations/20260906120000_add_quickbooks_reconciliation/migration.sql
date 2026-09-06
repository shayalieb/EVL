ALTER TABLE "QuickBooksConnection"
  ADD COLUMN "reconciliationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reconciliationFrequencyHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "lastReconciliationAt" TIMESTAMP(3),
  ADD COLUMN "lastReconciliationStatus" TEXT;
