// One-off, idempotent cleanup for legacy contractor payment due dates.
// Invalid values are set to null so Financials can safely use the event date
// as its default. Optimistic updates prevent this maintenance task from
// overwriting an event that a user edits while the cleanup is running.
//
// Usage: npm run cleanup:contractor-due-dates [-- --dry-run]
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { cleanContractorDueDates } from '../src/lib/contractorDueDateCleanup.js';

const dryRun = process.argv.includes('--dry-run');
const pageSize = 200;

async function main() {
  let cursor;
  let scannedEvents = 0;
  let updatedEvents = 0;
  let removedDates = 0;
  let skippedConcurrentEdits = 0;

  while (true) {
    const events = await prisma.event.findMany({
      orderBy: { id: 'asc' },
      take: pageSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, updatedAt: true, contractorBookings: true },
    });
    if (!events.length) break;
    scannedEvents += events.length;

    for (const event of events) {
      const cleaned = cleanContractorDueDates(event.contractorBookings);
      if (!cleaned.removedCount) continue;
      removedDates += cleaned.removedCount;
      if (dryRun) { updatedEvents += 1; continue; }
      // eslint-disable-next-line no-await-in-loop
      const result = await prisma.event.updateMany({
        where: { id: event.id, updatedAt: event.updatedAt },
        data: { contractorBookings: cleaned.contractorBookings },
      });
      if (result.count) updatedEvents += 1;
      else skippedConcurrentEdits += 1;
    }
    cursor = events.at(-1).id;
  }

  console.log(`${dryRun ? 'Would clean' : 'Cleaned'} ${removedDates} invalid contractor due date(s) across ${updatedEvents} of ${scannedEvents} scanned event(s).`);
  if (skippedConcurrentEdits) console.log(`Skipped ${skippedConcurrentEdits} concurrently edited event(s); safely rerun the command to retry them.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
