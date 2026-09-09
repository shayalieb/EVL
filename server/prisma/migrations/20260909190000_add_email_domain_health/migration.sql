ALTER TABLE "EmailDomain"
ADD COLUMN "sendingStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "receivingStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "pendingSendingStatus" TEXT,
ADD COLUMN "pendingReceivingStatus" TEXT,
ADD COLUMN "lastHealthCheckedAt" TIMESTAMP(3),
ADD COLUMN "lastTestEmailAt" TIMESTAMP(3);

UPDATE "EmailDomain" SET "sendingStatus" = "status" WHERE "status" = 'verified';
