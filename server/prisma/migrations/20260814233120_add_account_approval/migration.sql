-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: every account that already exists is grandfathered in as
-- approved (self-signup approval only applies going forward, to accounts
-- created after this migration) — see schema.prisma's Account.approvedAt.
UPDATE "Account" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;
