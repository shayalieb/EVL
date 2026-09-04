-- Restore contractor-level SMS consent. An earlier multichannel migration
-- accidentally moved these fields to Guest, which is not the SMS recipient
-- used by contractor strips.
ALTER TABLE "Contractor"
ADD COLUMN "smsConsentStatus" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "smsConsentedAt" TIMESTAMP(3),
ADD COLUMN "smsOptedOutAt" TIMESTAMP(3);

CREATE TABLE "MessagingProfile" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'not_started',
  "provider" TEXT NOT NULL DEFAULT 'twilio',
  "phoneNumber" TEXT,
  "providerNumberSid" TEXT,
  "messagingServiceSid" TEXT,
  "areaCodePreference" TEXT,
  "businessName" TEXT,
  "businessWebsite" TEXT,
  "businessAddress" TEXT,
  "businessCity" TEXT,
  "businessRegion" TEXT,
  "businessPostalCode" TEXT,
  "businessCountry" TEXT DEFAULT 'US',
  "useCaseDescription" TEXT,
  "consentAttestedAt" TIMESTAMP(3),
  "consentAttestedById" TEXT,
  "requestedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "monthlyMessageLimit" INTEGER,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodCount" INTEGER NOT NULL DEFAULT 0,
  "internalNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessagingProfile_accountId_key" ON "MessagingProfile"("accountId");
CREATE UNIQUE INDEX "MessagingProfile_phoneNumber_key" ON "MessagingProfile"("phoneNumber");
CREATE UNIQUE INDEX "MessagingProfile_providerNumberSid_key" ON "MessagingProfile"("providerNumberSid");
CREATE INDEX "MessagingProfile_status_requestedAt_idx" ON "MessagingProfile"("status", "requestedAt");
ALTER TABLE "MessagingProfile" ADD CONSTRAINT "MessagingProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
