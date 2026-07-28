-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "disabledById" TEXT,
ADD COLUMN     "disabledReason" TEXT;

-- AlterTable
ALTER TABLE "SupportThread" ADD COLUMN     "assignedAdminId" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'normal';

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_disabledById_fkey" FOREIGN KEY ("disabledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

