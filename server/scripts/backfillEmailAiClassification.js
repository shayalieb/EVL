// One-off, idempotent — see server/src/lib/emailAiBackfill.js for what this
// actually does. This file is just the local-dev CLI entry point; the same
// logic is also reachable from production via the admin-triggered route
// (POST /api/admin/maintenance/backfill-email-ai-classification), since
// production's DB is only reachable from inside the running app, not by
// running this script directly against it.
//
// Usage: npm run backfill:email-ai-classification   (from server/)
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { backfillEmailAiClassification } from '../src/lib/emailAiBackfill.js';

backfillEmailAiClassification()
  .then((summary) => {
    console.log('Email AI classification backfill complete:', summary);
    return prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
