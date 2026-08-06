-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "rsvpStatus" TEXT NOT NULL DEFAULT 'invited',
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRsvpLink" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRsvpLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Guest_accountId_eventId_idx" ON "Guest"("accountId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvpLink_tokenHash_key" ON "EventRsvpLink"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvpLink_publicToken_key" ON "EventRsvpLink"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvpLink_accountId_eventId_key" ON "EventRsvpLink"("accountId", "eventId");

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvpLink" ADD CONSTRAINT "EventRsvpLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
