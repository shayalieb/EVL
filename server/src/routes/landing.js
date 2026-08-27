import { Router } from 'express';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { sendMail, buildFromHeader, escapeHtml } from '../lib/mailer.js';
import { getWebsiteConfig } from '../lib/websiteConfig.js';

// Public (unauthenticated) — submissions from the marketing site
// (gigworks.io), someone who doesn't have an account yet. Same
// generous-but-bounded shape as auth.js's credentialsLimiter, tuned for a
// form real visitors fill out at most once or twice, not for the retry
// volume a login form sees.
const submitLimiter = createRateLimiter('landing-submit', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Too many requests. Please try again shortly.' },
});

export const publicLandingRouter = Router();

publicLandingRouter.get('/config', asyncHandler(async (req, res) => {
  res.json({ config: await getWebsiteConfig() });
}));

// Best-effort — the entry is already saved in WaitlistEntry regardless of
// whether this send succeeds, same reasoning as support.js's notifyAdmin.
async function notifyOwner(entry) {
  const to = process.env.SUPPORT_NOTIFICATION_EMAIL || 'shayalieberman@gmail.com';
  const subject = entry.type === 'waitlist'
    ? `[Waitlist] ${entry.name}`
    : `[Contact] ${entry.name}`;
  const lines = [
    `<p><strong>${escapeHtml(entry.name)}</strong> (${escapeHtml(entry.email)})</p>`,
    entry.businessName ? `<p>Business: ${escapeHtml(entry.businessName)}</p>` : '',
    entry.message ? `<p>${escapeHtml(entry.message)}</p>` : '',
  ].filter(Boolean).join('');
  try {
    await sendMail({ from: buildFromHeader(), to, subject, html: lines });
  } catch {
    // best effort
  }
}

publicLandingRouter.post('/waitlist', submitLimiter, asyncHandler(async (req, res) => {
  const { name, email, businessName, selectedPlan, billingInterval } = req.body || {};
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  const entry = await prisma.waitlistEntry.create({
    data: {
      type: 'waitlist',
      name: name.trim(),
      email: email.trim().toLowerCase(),
      businessName: businessName?.trim() || null,
      selectedPlan: ['solo', 'team', 'studio'].includes(selectedPlan) ? selectedPlan : null,
      billingInterval: ['month', 'year'].includes(billingInterval) ? billingInterval : null,
    },
  });
  await notifyOwner(entry);
  res.status(201).json({ ok: true });
}));

publicLandingRouter.post('/contact', submitLimiter, asyncHandler(async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  const entry = await prisma.waitlistEntry.create({
    data: { type: 'contact', name: name.trim(), email: email.trim(), message: message.trim() },
  });
  await notifyOwner(entry);
  res.status(201).json({ ok: true });
}));

export default publicLandingRouter;
