-- DropIndex
DROP INDEX "EmailDomain_subdomain_key";

-- AlterTable
ALTER TABLE "EmailDomain" DROP COLUMN "subdomain",
ADD COLUMN     "domain" TEXT NOT NULL,
ADD COLUMN     "isCustomDomain" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_domain_key" ON "EmailDomain"("domain");

