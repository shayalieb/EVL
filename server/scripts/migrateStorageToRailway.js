import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { mapWithConcurrency } from '../src/lib/concurrency.js';
import { copySupabaseObjectToRailway } from '../src/lib/fileStorage.js';

const sources = await Promise.all([
  prisma.eventDocument.findMany({ where: { storageKey: { not: null } }, select: { storageKey: true, contentType: true } }),
  prisma.bookingDocument.findMany({ where: { storageKey: { not: null } }, select: { storageKey: true, contentType: true } }),
  prisma.supportAttachment.findMany({ where: { storageKey: { not: null } }, select: { storageKey: true, contentType: true } }),
  prisma.stagePlotPage.findMany({ where: { thumbnailStorageKey: { not: null } }, select: { thumbnailStorageKey: true } }),
  prisma.floorPlanPage.findMany({ where: { thumbnailStorageKey: { not: null } }, select: { thumbnailStorageKey: true } }),
  prisma.stagePlotLibraryPage.findMany({ where: { thumbnailStorageKey: { not: null } }, select: { thumbnailStorageKey: true } }),
]);

const objects = new Map();
for (const row of sources.flat()) {
  const storageKey = row.storageKey || row.thumbnailStorageKey;
  if (storageKey) objects.set(storageKey, { storageKey, contentType: row.contentType || 'image/png' });
}

console.log(`Found ${objects.size} referenced storage objects.`);
const results = await mapWithConcurrency([...objects.values()], 3, copySupabaseObjectToRailway);
const failures = results.filter((result) => result.status === 'rejected');
const copied = results.filter((result) => result.status === 'fulfilled' && result.value.copied);
const skipped = results.length - copied.length - failures.length;

console.log(`Copied ${copied.length}; already present ${skipped}; failed ${failures.length}.`);
for (const failure of failures.slice(0, 10)) console.error(failure.reason?.message || failure.reason);

await prisma.$disconnect();
if (failures.length) process.exitCode = 1;
