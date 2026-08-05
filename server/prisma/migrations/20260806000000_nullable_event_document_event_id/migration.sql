-- EventDocument now also represents account-level attachments that aren't
-- tied to any event (e.g. a PDF attached to a song in the reusable Set
-- List library) — eventId null means "not scoped to an event".
ALTER TABLE "EventDocument" ALTER COLUMN "eventId" DROP NOT NULL;
