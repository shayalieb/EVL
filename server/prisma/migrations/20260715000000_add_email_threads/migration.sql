-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "contractorEmail" TEXT NOT NULL,
    "replyToAlias" TEXT,
    "subjectHint" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "templateId" TEXT,
    "sentByUserId" TEXT,
    "resendMessageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailThread_accountId_idx" ON "EmailThread"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_accountId_eventId_contractorId_key" ON "EmailThread"("accountId", "eventId", "contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_resendMessageId_key" ON "EmailMessage"("resendMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_createdAt_idx" ON "EmailMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
