import { prisma } from './prisma.js';
import { mapWithConcurrency } from './concurrency.js';
import { sendMail, resolveFromHeader, escapeHtml, buildActionEmailHtml } from './mailer.js';

const POLL_INTERVAL_MS = 60 * 1000;
// A claim older than this is treated as abandoned (the instance that made
// it likely crashed mid-send) and up for grabs again — see the claim
// comment in tick() below.
const CLAIM_STALE_MS = 5 * 60 * 1000;

function formatRemindAt(date, timeZone) {
  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  });
}

// Falls back to the account owner's email when the reminder's own creator
// has none (most commonly: that membership's user was deleted, which
// SetNulls Reminder.createdByUserId — see the schema). Returns null only
// when neither exists, which should be rare (every account has an owner).
async function resolveRecipient(reminder) {
  if (reminder.createdByUser?.email) return reminder.createdByUser.email;
  const ownerMembership = await prisma.membership.findFirst({
    where: { accountId: reminder.accountId, role: 'owner' },
    include: { user: true },
  });
  return ownerMembership?.user?.email || null;
}

// Returns whether an email was actually sent — tick() below only marks
// emailSentAt on true, so a reminder with no resolvable recipient stays
// visibly un-sent (not silently marked as if it had gone out) and keeps
// getting logged on every tick until the underlying account state is fixed,
// rather than either lying about it or retrying invisibly forever.
async function sendReminderEmail(reminder) {
  const to = await resolveRecipient(reminder);
  if (!to) {
    console.error(`Reminder ${reminder.id} (account ${reminder.accountId}) has no resolvable recipient — creator has no email and no owner membership has one either. Skipping.`);
    return false;
  }

  const businessInfo = reminder.account?.accountData?.data?.businessInfo;
  const fromName = businessInfo?.name || 'GigWorks';
  const RELATED_TYPE_LABELS = { client: 'Client', contractor: 'Contractor', event: 'Event', invoice: 'Invoice', booking: 'Booking' };
  const relatedLine = reminder.relatedName
    ? `<p><strong>${escapeHtml(RELATED_TYPE_LABELS[reminder.relatedType] || 'Related')}:</strong> ${escapeHtml(reminder.relatedName)}</p>`
    : '';

  await sendMail({
    from: await resolveFromHeader({ accountId: reminder.accountId, fromName, localPart: 'reminders' }),
    to,
    subject: `Reminder: ${reminder.note.slice(0, 80)}`,
    html: buildActionEmailHtml({
      businessInfo,
      heading: 'Reminder',
      bodyHtml: `${relatedLine}<p>${escapeHtml(reminder.note)}</p><p style="color:#94a3b8;">Was due ${escapeHtml(formatRemindAt(reminder.remindAt, reminder.emailTimeZone))}</p>`,
    }),
  });
  return true;
}

let running = false;
const SEND_BATCH_SIZE = 100;
const SEND_CONCURRENCY = 10;

// Exported for the same on-demand-testing reason as reminderRuleEngine.js's tick.
export async function tick() {
  if (running) return;
  running = true;
  try {
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS);
    const dueReminders = await prisma.reminder.findMany({
      where: {
        emailEnabled: true,
        emailSentAt: null,
        completedAt: null,
        remindAt: { lte: new Date() },
        OR: [{ emailClaimedAt: null }, { emailClaimedAt: { lt: staleBefore } }],
      },
      include: {
        createdByUser: true,
        account: { include: { accountData: true } },
      },
      orderBy: [{ remindAt: 'asc' }, { id: 'asc' }],
      take: SEND_BATCH_SIZE,
    });

    const results = await mapWithConcurrency(dueReminders, SEND_CONCURRENCY, async (reminder) => {
      // Atomic claim so multiple backend instances polling at once never
      // both send the same reminder — a plain conditional UPDATE is
      // race-safe under concurrent connections, unlike a Postgres advisory
      // lock (which doesn't compose safely with connection pooling).
      const claim = await prisma.reminder.updateMany({
        where: {
          id: reminder.id,
          emailSentAt: null,
          OR: [{ emailClaimedAt: null }, { emailClaimedAt: { lt: staleBefore } }],
        },
        data: { emailClaimedAt: new Date(), emailAttemptCount: { increment: 1 } },
      });
      if (claim.count === 0) return; // another instance claimed it first this tick

      const sent = await sendReminderEmail(reminder);
      if (sent) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { emailSentAt: new Date(), emailClaimedAt: null, emailLastFailedAt: null },
        });
      } else {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { emailLastFailedAt: new Date() },
        });
      }
      // Not sent (no resolvable recipient): leave emailSentAt null and
      // emailClaimedAt stands until it goes stale, so this logs again and
      // is retried each tick rather than silently pretending it went out.
    });

    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(`Failed to send reminder email for reminder ${dueReminders[i].id}:`, result.reason);
      }
    });
    await Promise.all(results.map((result, i) => (
      result.status === 'rejected'
        ? prisma.reminder.update({
          where: { id: dueReminders[i].id },
          data: { emailLastFailedAt: new Date() },
        }).catch((error) => console.error(`Failed to record reminder delivery failure for ${dueReminders[i].id}:`, error))
        : null
    )));
  } catch (err) {
    console.error('Reminder scheduler tick failed:', err);
  } finally {
    running = false;
  }
}

export function startReminderScheduler() {
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
