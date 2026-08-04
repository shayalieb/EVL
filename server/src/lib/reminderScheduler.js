import { prisma } from './prisma.js';
import { sendMail, resolveFromHeader, escapeHtml, buildActionEmailHtml } from './mailer.js';

const POLL_INTERVAL_MS = 60 * 1000;
// A claim older than this is treated as abandoned (the instance that made
// it likely crashed mid-send) and up for grabs again — see the claim
// comment in tick() below.
const CLAIM_STALE_MS = 5 * 60 * 1000;

function formatRemindAt(date) {
  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function sendReminderEmail(reminder) {
  const to = reminder.createdByUser?.email;
  if (!to) return;

  const businessInfo = reminder.account?.accountData?.data?.businessInfo;
  const fromName = businessInfo?.name || 'GigWorks';
  const relatedLine = reminder.relatedName
    ? `<p><strong>${escapeHtml(reminder.relatedType === 'client' ? 'Client' : 'Contractor')}:</strong> ${escapeHtml(reminder.relatedName)}</p>`
    : '';

  await sendMail({
    from: await resolveFromHeader({ accountId: reminder.accountId, fromName, localPart: 'reminders' }),
    to,
    subject: `Reminder: ${reminder.note.slice(0, 80)}`,
    html: buildActionEmailHtml({
      businessInfo,
      heading: 'Reminder',
      bodyHtml: `${relatedLine}<p>${escapeHtml(reminder.note)}</p><p style="color:#94a3b8;">Was due ${escapeHtml(formatRemindAt(reminder.remindAt))}</p>`,
    }),
  });
}

let running = false;

async function tick() {
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
    });

    const results = await Promise.allSettled(dueReminders.map(async (reminder) => {
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
        data: { emailClaimedAt: new Date() },
      });
      if (claim.count === 0) return; // another instance claimed it first this tick

      await sendReminderEmail(reminder);
      await prisma.reminder.update({ where: { id: reminder.id }, data: { emailSentAt: new Date() } });
    }));

    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(`Failed to send reminder email for reminder ${dueReminders[i].id}:`, result.reason);
      }
    });
  } catch (err) {
    console.error('Reminder scheduler tick failed:', err);
  } finally {
    running = false;
  }
}

export function startReminderScheduler() {
  setInterval(tick, POLL_INTERVAL_MS);
}
