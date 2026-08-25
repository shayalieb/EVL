ALTER TABLE "Reminder"
ADD COLUMN "recurrenceFrequency" TEXT,
ADD COLUMN "recurrenceEndsAt" TIMESTAMP(3),
ADD COLUMN "recurrenceSeriesId" TEXT,
ADD COLUMN "recurrenceSequence" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Reminder_recurrenceSeriesId_recurrenceSequence_key"
ON "Reminder"("recurrenceSeriesId", "recurrenceSequence");
