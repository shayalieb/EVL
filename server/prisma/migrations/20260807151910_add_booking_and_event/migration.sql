-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventName" TEXT,
    "clientId" TEXT,
    "eventDate" TEXT,
    "eventType" TEXT,
    "brideName" TEXT,
    "groomName" TEXT,
    "guestCount" TEXT,
    "depositAmount" DOUBLE PRECISION,
    "depositDueDate" TEXT,
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "depositType" TEXT DEFAULT 'fixed',
    "depositPercent" TEXT,
    "bookingStatus" TEXT,
    "priority" TEXT,
    "nextFollowUpDate" TEXT,
    "contractSignedDate" TEXT,
    "referralSource" TEXT,
    "notes" TEXT,
    "convertedEventId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "venue" JSONB NOT NULL DEFAULT '{}',
    "schedule" JSONB NOT NULL DEFAULT '[]',
    "activityLog" JSONB NOT NULL DEFAULT '[]',
    "proposal" JSONB,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT,
    "eventType" TEXT,
    "eventDate" TEXT,
    "eventDayOfTheWeek" TEXT,
    "clientId" TEXT,
    "brideName" TEXT,
    "groomName" TEXT,
    "guestCount" TEXT,
    "contactPhone" TEXT,
    "contactPhoneExt" TEXT,
    "contactEmail" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "eventNote" TEXT,
    "prepNotes" TEXT,
    "eventStatus" TEXT,
    "deletedAt" TIMESTAMP(3),
    "venue" JSONB NOT NULL DEFAULT '{}',
    "contractorBookings" JSONB NOT NULL DEFAULT '[]',
    "categoryTabs" JSONB NOT NULL DEFAULT '[]',
    "schedule" JSONB NOT NULL DEFAULT '[]',
    "prepGroups" JSONB NOT NULL DEFAULT '[]',
    "requests" JSONB NOT NULL DEFAULT '[]',
    "shotList" JSONB NOT NULL DEFAULT '[]',
    "secondShooters" JSONB NOT NULL DEFAULT '[]',
    "otherExpenses" JSONB NOT NULL DEFAULT '[]',
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_accountId_idx" ON "Booking"("accountId");

-- CreateIndex
CREATE INDEX "Event_accountId_idx" ON "Event"("accountId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

