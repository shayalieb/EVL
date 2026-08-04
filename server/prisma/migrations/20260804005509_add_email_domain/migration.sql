-- CreateTable
CREATE TABLE "EmailDomain" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "resendDomainId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dnsRecords" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_accountId_key" ON "EmailDomain"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_subdomain_key" ON "EmailDomain"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_resendDomainId_key" ON "EmailDomain"("resendDomainId");

-- AddForeignKey
ALTER TABLE "EmailDomain" ADD CONSTRAINT "EmailDomain_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

