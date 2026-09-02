ALTER TABLE "EmailMessage"
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'email',
ADD COLUMN "provider" TEXT,
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'sent',
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "failureCode" TEXT;

CREATE UNIQUE INDEX "EmailMessage_providerMessageId_key" ON "EmailMessage"("providerMessageId");
CREATE INDEX "EmailMessage_channel_deliveryStatus_idx" ON "EmailMessage"("channel", "deliveryStatus");

ALTER TABLE "Contractor"
ADD COLUMN "smsConsentStatus" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "smsConsentedAt" TIMESTAMP(3),
ADD COLUMN "smsOptedOutAt" TIMESTAMP(3),
ADD COLUMN "whatsappConsentStatus" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "whatsappConsentedAt" TIMESTAMP(3),
ADD COLUMN "whatsappOptedOutAt" TIMESTAMP(3);
