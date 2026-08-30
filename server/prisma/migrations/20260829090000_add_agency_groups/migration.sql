CREATE TABLE "AgencyGroup" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "logo" TEXT,
  "stationery" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgencyGroup_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Booking" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Event" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Account" ADD COLUMN "agencyGroupLimit" INTEGER;
ALTER TABLE "WaitlistEntry" ADD COLUMN "requestedGroupCount" INTEGER;
CREATE UNIQUE INDEX "AgencyGroup_accountId_name_key" ON "AgencyGroup"("accountId", "name");
CREATE INDEX "AgencyGroup_accountId_active_name_idx" ON "AgencyGroup"("accountId", "active", "name");
CREATE INDEX "Booking_accountId_groupId_deletedAt_eventDate_idx" ON "Booking"("accountId", "groupId", "deletedAt", "eventDate");
CREATE INDEX "Event_accountId_groupId_deletedAt_eventDate_idx" ON "Event"("accountId", "groupId", "deletedAt", "eventDate");
ALTER TABLE "AgencyGroup" ADD CONSTRAINT "AgencyGroup_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AgencyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AgencyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
