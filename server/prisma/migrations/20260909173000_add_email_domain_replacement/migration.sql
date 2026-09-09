ALTER TABLE "EmailDomain"
ADD COLUMN "pendingDomain" TEXT,
ADD COLUMN "pendingIsCustomDomain" BOOLEAN,
ADD COLUMN "pendingResendDomainId" TEXT,
ADD COLUMN "pendingStatus" TEXT,
ADD COLUMN "pendingDnsRecords" JSONB,
ADD COLUMN "pendingCreatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "EmailDomain_pendingDomain_key" ON "EmailDomain"("pendingDomain");
CREATE UNIQUE INDEX "EmailDomain_pendingResendDomainId_key" ON "EmailDomain"("pendingResendDomainId");
