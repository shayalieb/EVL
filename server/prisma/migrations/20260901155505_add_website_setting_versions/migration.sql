-- DropIndex
DROP INDEX "Client_nameNormalized_trgm_idx";

-- AlterTable
ALTER TABLE "WaitlistEntry" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "WebsiteSettingVersion" (
    "id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteSettingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteSettingVersion_publishedAt_idx" ON "WebsiteSettingVersion"("publishedAt");
