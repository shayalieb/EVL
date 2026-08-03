-- AlterTable
ALTER TABLE "InquiryLink" ADD COLUMN     "isReusable" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "expiresAt" DROP NOT NULL;

