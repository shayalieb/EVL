ALTER TABLE "Event"
ADD COLUMN "prepFormUnreadCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "prepFormLastSubmittedAt" TIMESTAMP(3);

CREATE TABLE "EventPrepFormLink" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "publicToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventPrepFormLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventPrepFormLink_eventId_key" ON "EventPrepFormLink"("eventId");
CREATE UNIQUE INDEX "EventPrepFormLink_tokenHash_key" ON "EventPrepFormLink"("tokenHash");
CREATE UNIQUE INDEX "EventPrepFormLink_publicToken_key" ON "EventPrepFormLink"("publicToken");
CREATE INDEX "EventPrepFormLink_accountId_idx" ON "EventPrepFormLink"("accountId");
ALTER TABLE "EventPrepFormLink" ADD CONSTRAINT "EventPrepFormLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
