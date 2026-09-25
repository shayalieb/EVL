CREATE TABLE "InboxThread" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "contactEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bookingId" TEXT,
  "clientId" TEXT,
  "contractorId" TEXT,
  "eventId" TEXT,
  "replyAlias" TEXT,
  "replyAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "archivedAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InboxThread_replyAlias_key" ON "InboxThread"("replyAlias");
CREATE INDEX "InboxThread_accountId_lastMessageAt_idx" ON "InboxThread"("accountId", "lastMessageAt");
CREATE INDEX "InboxThread_accountId_contactEmail_bookingId_idx" ON "InboxThread"("accountId", "contactEmail", "bookingId");
CREATE TABLE "InboxMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "threadId" TEXT NOT NULL REFERENCES "InboxThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "direction" TEXT NOT NULL,
  "fromAddress" TEXT NOT NULL,
  "toAddress" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "internetMessageId" TEXT,
  "deliveryStatus" TEXT NOT NULL DEFAULT 'queued',
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InboxMessage_providerMessageId_key" ON "InboxMessage"("providerMessageId");
CREATE INDEX "InboxMessage_threadId_createdAt_idx" ON "InboxMessage"("threadId", "createdAt");
CREATE TABLE "InboxAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL REFERENCES "InboxMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "filename" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "providerAttachmentId" TEXT,
  "data" BYTEA
);
CREATE INDEX "InboxAttachment_messageId_idx" ON "InboxAttachment"("messageId");
