-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "agreementsRequiredAt" TIMESTAMP(3),
ADD COLUMN     "agreementsSignedAt" TIMESTAMP(3),
ADD COLUMN     "isDesignPartner" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DesignPartnerAgreement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "documentText" TEXT NOT NULL,
    "termYears" INTEGER NOT NULL DEFAULT 2,
    "signedAt" TIMESTAMP(3),
    "signatureName" TEXT,
    "signatureImage" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignPartnerAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignPartnerAgreement_accountId_idx" ON "DesignPartnerAgreement"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignPartnerAgreement_accountId_type_key" ON "DesignPartnerAgreement"("accountId", "type");

-- AddForeignKey
ALTER TABLE "DesignPartnerAgreement" ADD CONSTRAINT "DesignPartnerAgreement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
