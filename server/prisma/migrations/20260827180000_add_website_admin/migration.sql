ALTER TABLE "Account"
ADD COLUMN "signupSource" TEXT NOT NULL DEFAULT 'admin',
ADD COLUMN "signupPlan" TEXT,
ADD COLUMN "signupInterval" TEXT;

-- Existing self-signups were created without an approving admin. Preserve
-- that acquisition source when introducing the explicit column.
UPDATE "Account" SET "signupSource" = 'public' WHERE "approvedById" IS NULL;

ALTER TABLE "WaitlistEntry"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'new',
ADD COLUMN "selectedPlan" TEXT,
ADD COLUMN "billingInterval" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "WebsiteSetting" (
  "id" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebsiteSetting_pkey" PRIMARY KEY ("id")
);
