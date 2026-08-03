-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "relatedName" TEXT,
    "note" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_accountId_remindAt_idx" ON "Reminder"("accountId", "remindAt");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

