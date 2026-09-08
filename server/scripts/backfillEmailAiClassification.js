// One-off, idempotent: reclassifies inbound EmailMessage rows that never got
// an AI reply classification (aiClassification null — e.g. received while
// ANTHROPIC_API_KEY was missing/misconfigured, or from before this feature
// shipped) or came back 'ambiguous'. For each, re-runs the same classifier
// used live in emailWebhooks.js's /resend handler and, if confident, applies
// the same auto-status-update (contractorAiStatusUpdate.js) — respecting the
// same guard that only acts while the booking is still 'tentative', so a
// human's own decision is never overturned.
//
// Only touches rows still null/ambiguous, and once a row is reclassified its
// aiClassification is persisted — safe to re-run, later runs are no-ops for
// already-processed rows.
//
// Usage: npm run backfill:email-ai-classification   (from server/)
import 'dotenv/config';
import sanitizeHtml from 'sanitize-html';
import { prisma } from '../src/lib/prisma.js';
import { stripQuotedText } from '../src/lib/emailQuoteStrip.js';
import { classifyContractorReply } from '../src/lib/emailReplyClassifier.js';
import { applyAiReplyClassification } from '../src/lib/contractorAiStatusUpdate.js';

// Mirrors emailWebhooks.js's private cleanReplyContent()'s plainReply
// derivation — the classifier expects quote-stripped plain text, and the
// stored `body` here can be real HTML markup or HTML-escaped text, neither
// of which is safe to feed it directly.
function toPlainReply(body) {
  return stripQuotedText(sanitizeHtml(body || '', { allowedTags: [], allowedAttributes: {} }));
}

async function main() {
  const rows = await prisma.emailMessage.findMany({
    where: { direction: 'inbound', OR: [{ aiClassification: null }, { aiClassification: 'ambiguous' }] },
    include: { thread: true },
    orderBy: { createdAt: 'asc' },
  });

  const summary = { scanned: rows.length, confirmed: 0, declined: 0, ambiguous: 0, bookingsUpdated: 0, skippedNoEvent: 0, errors: 0 };

  for (const row of rows) {
    try {
      const [contractor, eventRecord] = await Promise.all([
        prisma.contractor.findUnique({ where: { id: row.thread.contractorId } }),
        prisma.event.findUnique({ where: { id: row.thread.eventId } }),
      ]);
      if (!eventRecord) {
        summary.skippedNoEvent += 1;
        continue;
      }
      const contractorName = contractor ? [contractor.firstName, contractor.lastName].filter(Boolean).join(' ') : null;

      const classification = await classifyContractorReply({
        replyText: toPlainReply(row.body),
        contractorName,
        eventName: eventRecord.name,
        eventDate: eventRecord.eventDate,
      });

      await prisma.emailMessage.update({ where: { id: row.id }, data: { aiClassification: classification } });
      summary[classification] = (summary[classification] || 0) + 1;

      if (classification === 'confirmed' || classification === 'declined') {
        const accountData = await prisma.accountData.findUnique({ where: { accountId: row.thread.accountId } });
        const inquiryStatuses = accountData?.data?.inquiryStatuses || [];
        const update = applyAiReplyClassification({
          event: eventRecord,
          inquiryStatuses,
          contractorId: row.thread.contractorId,
          classification,
          contractorName,
        });
        if (update) {
          await prisma.event.update({ where: { id: eventRecord.id }, data: update });
          summary.bookingsUpdated += 1;
        }
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`Failed to reclassify EmailMessage ${row.id}:`, err);
    }
  }

  return summary;
}

main()
  .then((summary) => {
    console.log('Email AI classification backfill complete:', summary);
    return prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
