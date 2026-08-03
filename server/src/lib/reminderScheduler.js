import { prisma } from './prisma.js';
import { sendMail, buildFromHeader, escapeHtml, buildActionEmailHtml } from './mailer.js';

const POLL_INTERVAL_MS = 60 * 1000;

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
    from: buildFromHeader(fromName),
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
    const dueReminders = await prisma.reminder.findMany({
      where: {
        emailEnabled: true,
        emailSentAt: null,
        completedAt: null,
        remindAt: { lte: new Date() },
      },
      include: {
        createdByUser: true,
        account: { include: { accountData: true } },
      },
    });

    const results = await Promise.allSettled(dueReminders.map(async (reminder) => {
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
