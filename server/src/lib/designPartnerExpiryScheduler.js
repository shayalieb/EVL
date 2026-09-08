import { prisma } from './prisma.js';
import { sendMail, resolveFromHeader, buildActionEmailHtml, escapeHtml } from './mailer.js';

// Daily is plenty here — unlike reminderScheduler.js's minute-level
// due-time checks, a 30-day advance notice has no meaningful urgency at
// finer granularity, and the claim below makes repeated polling harmless
// either way.
const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WARNING_WINDOW_DAYS = 30;

function resolveRecipient(account) {
  const owner = account.memberships.find((m) => m.role === 'owner');
  return owner?.user?.email || null;
}

async function sendExpiryWarningEmail(account) {
  const to = resolveRecipient(account);
  if (!to) {
    console.error(`Design partner account ${account.id} has no owner with an email — can't send the 30-day expiry notice.`);
    return false;
  }
  const businessInfo = account.accountData?.data?.businessInfo;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const expiresAt = new Date(account.freeAccessExpiresAt).toLocaleDateString();

  await sendMail({
    from: await resolveFromHeader({ accountId: account.id, fromName: businessInfo?.name || 'GigWorks', localPart: 'hello' }),
    to,
    subject: 'Your free GigWorks design partner access ends in 30 days',
    html: buildActionEmailHtml({
      businessInfo,
      heading: 'Your free access is ending soon',
      bodyHtml: `<p>Thank you for being a GigWorks design partner — your 2 years of free access ends on <strong>${escapeHtml(expiresAt)}</strong>.</p><p>Nothing is cut off automatically. Pick a plan any time before or after that date to keep using GigWorks without interruption.</p>`,
      buttonText: 'Choose a plan',
      buttonUrl: `${frontendUrl}/settings`,
    }),
  });
  return true;
}

let running = false;

// Exported for the same on-demand-testing reason as reminderScheduler.js's tick.
export async function tick() {
  if (running) return;
  running = true;
  try {
    const warningThreshold = new Date(Date.now() + WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const dueAccounts = await prisma.account.findMany({
      where: {
        isDesignPartner: true,
        freeAccessExpiresAt: { lte: warningThreshold },
        designPartnerExpiryNotifiedAt: null,
        subscriptionStatus: null, // already picked a plan — nothing to warn about
      },
      include: { memberships: { where: { role: 'owner' }, include: { user: true } }, accountData: true },
    });

    for (const account of dueAccounts) {
      // Send first, mark only on success — unlike reminderScheduler.js's
      // two-field claim/sent split, this is a single once-ever notice with
      // no urgency, so the simpler failure mode (a rare double-send if two
      // instances poll at the exact same moment) is far preferable to the
      // alternative of marking it sent before knowing whether it actually
      // went out, which would silently and permanently lose the notice on
      // any send failure.
      try {
        // eslint-disable-next-line no-await-in-loop
        const sent = await sendExpiryWarningEmail(account);
        if (sent) {
          // eslint-disable-next-line no-await-in-loop
          await prisma.account.update({ where: { id: account.id }, data: { designPartnerExpiryNotifiedAt: new Date() } });
        }
      } catch (err) {
        console.error(`Failed to send design partner expiry notice for account ${account.id}:`, err);
      }
    }
  } catch (err) {
    console.error('Design partner expiry scheduler tick failed:', err);
  } finally {
    running = false;
  }
}

export function startDesignPartnerExpiryScheduler() {
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
