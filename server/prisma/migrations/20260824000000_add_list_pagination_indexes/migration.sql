CREATE INDEX "Contractor_accountId_createdAt_id_idx" ON "Contractor"("accountId", "createdAt", "id");
CREATE INDEX "Client_accountId_createdAt_id_idx" ON "Client"("accountId", "createdAt", "id");
CREATE INDEX "Booking_accountId_deletedAt_createdAt_id_idx" ON "Booking"("accountId", "deletedAt", "createdAt", "id");
CREATE INDEX "Event_accountId_deletedAt_createdAt_id_idx" ON "Event"("accountId", "deletedAt", "createdAt", "id");
