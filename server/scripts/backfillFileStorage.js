// One-off, idempotent: uploads any pre-migration row's Postgres `data`
// bytes to Supabase Storage and sets `storageKey`, for EventDocument,
// BookingDocument, and SupportAttachment (see server/prisma/schema.prisma's
// data/storageKey comment on each model). Only touches rows where
// storageKey is still null — safe to re-run, already-migrated rows are
// skipped. Leaves `data` populated; dropping those columns is a separate,
// later, explicit step once downloads have been spot-checked in production.
//
// Usage: npm run backfill:storage   (from server/)
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { uploadFile } from '../src/lib/fileStorage.js';

async function backfillEventDocuments() {
  const rows = await prisma.eventDocument.findMany({ where: { storageKey: null, data: { not: null } } });
  for (const row of rows) {
    const storageKey = await uploadFile({ accountId: row.accountId, buffer: row.data, contentType: row.contentType });
    await prisma.eventDocument.update({ where: { id: row.id }, data: { storageKey } });
  }
  return rows.length;
}

async function backfillBookingDocuments() {
  const rows = await prisma.bookingDocument.findMany({ where: { storageKey: null, data: { not: null } } });
  for (const row of rows) {
    const storageKey = await uploadFile({ accountId: row.accountId, buffer: row.data, contentType: row.contentType });
    await prisma.bookingDocument.update({ where: { id: row.id }, data: { storageKey } });
  }
  return rows.length;
}

async function backfillSupportAttachments() {
  const rows = await prisma.supportAttachment.findMany({
    where: { storageKey: null, data: { not: null } },
    include: { message: { include: { thread: true } } },
  });
  for (const row of rows) {
    const storageKey = await uploadFile({ accountId: row.message.thread.accountId, buffer: row.data, contentType: row.contentType });
    await prisma.supportAttachment.update({ where: { id: row.id }, data: { storageKey } });
  }
  return rows.length;
}

const [eventDocs, bookingDocs, supportAttachments] = await Promise.all([
  backfillEventDocuments(),
  backfillBookingDocuments(),
  backfillSupportAttachments(),
]);

console.log(`Backfilled ${eventDocs} EventDocument, ${bookingDocs} BookingDocument, ${supportAttachments} SupportAttachment row(s).`);
await prisma.$disconnect();
