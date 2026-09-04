ALTER TABLE "QuickBooksConnection"
ADD COLUMN "accountsSnapshot" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "classesSnapshot" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "locationsSnapshot" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "itemsSnapshot" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "accountingMappings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "referenceDataRefreshedAt" TIMESTAMP(3),
ADD COLUMN "setupCompletedAt" TIMESTAMP(3);
