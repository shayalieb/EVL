ALTER TABLE "Contract"
ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'contract',
ADD COLUMN "documentHash" TEXT,
ADD COLUMN "clientConsentVersion" TEXT,
ADD COLUMN "clientSignedIp" TEXT,
ADD COLUMN "clientSignedUserAgent" TEXT,
ADD COLUMN "ownerConsentVersion" TEXT,
ADD COLUMN "ownerSignedIp" TEXT,
ADD COLUMN "ownerSignedUserAgent" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "finalRecord" JSONB,
ADD COLUMN "finalRecordHash" TEXT;
