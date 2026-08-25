import { prisma } from './prisma.js';
import { withBackgroundJobLease } from './backgroundJobLease.js';

// Unused inquiry links (never opened/submitted) are single-use invite
// tokens meant to be acted on quickly — a stale one lingering forever is
// just clutter, so unlike Booking/Event's 30-day soft-delete window (see
// deletedRecordPurger.js) this hard-deletes much sooner and skips the
// "keep it recoverable for a while" step entirely: there's nothing on an
// unused link worth recovering. Reusable links (the one pasted on a
// business's own website) and links a client has already submitted a
// response to are never touched here — a submitted response is real data
// worth keeping until the owner deals with it (see inquiryLinks.js's
// DELETE /:id for the manual equivalent, which does allow deleting one of
// those on purpose).
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour — short retention needs tighter polling than the 30-day purger's 6h
const RETENTION_HOURS = 48;
const PURGE_BATCH_SIZE = 500;

function cutoffDate() {
  return new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
}

let running = false;

// Exported for the same on-demand-testing reason as deletedRecordPurger.js's tick.
export async function tick() {
  if (running) return;
  running = true;
  try {
    await withBackgroundJobLease('inquiry-link-purger', async () => {
      const before = cutoffDate();
      // sentAt is when the link was actually emailed; a link that was only
      // ever copied/shared manually (no recipientEmail, sentAt null) ages out
      // from createdAt instead.
      const expired = await prisma.inquiryLink.findMany({
        where: {
          isReusable: false,
          status: 'open',
          OR: [
            { sentAt: { not: null, lt: before } },
            { sentAt: null, createdAt: { lt: before } },
          ],
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: PURGE_BATCH_SIZE,
      });
      if (expired.length) {
        await prisma.inquiryLink.deleteMany({ where: { id: { in: expired.map((link) => link.id) } } });
      }
    }, POLL_INTERVAL_MS);
  } catch (err) {
    console.error('Inquiry link purge tick failed:', err);
  } finally {
    running = false;
  }
}

export function startInquiryLinkPurger() {
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
