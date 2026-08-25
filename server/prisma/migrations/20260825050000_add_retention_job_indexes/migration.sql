CREATE INDEX "Booking_deletedAt_idx" ON "Booking"("deletedAt");
CREATE INDEX "Event_deletedAt_idx" ON "Event"("deletedAt");

CREATE INDEX "InquiryLink_open_sent_retention_idx"
ON "InquiryLink"("sentAt", "id")
WHERE "isReusable" = false AND "status" = 'open' AND "sentAt" IS NOT NULL;

CREATE INDEX "InquiryLink_open_unsent_retention_idx"
ON "InquiryLink"("createdAt", "id")
WHERE "isReusable" = false AND "status" = 'open' AND "sentAt" IS NULL;
