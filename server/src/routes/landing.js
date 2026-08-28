import { Router } from 'express';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { sendMail, buildFromHeader, buildActionEmailHtml, escapeHtml } from '../lib/mailer.js';
import { getWebsiteConfig } from '../lib/websiteConfig.js';
import { hashToken } from '../lib/resetToken.js';

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

publicLandingRouter.get('/review/:token', asyncHandler(async (req, res) => {
  const request = await prisma.websiteReviewRequest.findUnique({ where: { tokenHash: hashToken(req.params.token) } });
  if (!request) return res.status(404).json({ error: 'This review link is invalid.' });
  const expired = request.expiresAt <= new Date();
  res.json({ request: { recipientName: request.recipientName, groupName: request.requestedGroupName, status: expired && request.status === 'open' ? 'expired' : request.status, expiresAt: request.expiresAt } });
}));

publicLandingRouter.post('/review/:token', submitLimiter, asyncHandler(async (req, res) => {
  const tokenHash = hashToken(req.params.token);
  const request = await prisma.websiteReviewRequest.findUnique({ where: { tokenHash } });
  if (!request) return res.status(404).json({ error: 'This review link is invalid.' });
  if (request.status !== 'open') return res.status(409).json({ error: 'This review has already been submitted.' });
  if (request.expiresAt <= new Date()) return res.status(410).json({ error: 'This review link has expired. Please ask for a new one.' });
  const { reviewerName, groupName, groupType, rating, quote, storyTitle, storySummary, storyBody, displayConsent } = req.body || {};
  const parsedRating = Number.parseInt(rating, 10);
  if (!groupName?.trim() || !quote?.trim() || !Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) return res.status(400).json({ error: 'Group name, review, and a rating from 1 to 5 are required.' });
  if (displayConsent !== true) return res.status(400).json({ error: 'Permission to display the review is required.' });
  const data = {
    status: 'submitted', reviewerName: reviewerName?.trim().slice(0, 120) || null, groupName: groupName.trim().slice(0, 140), groupType: groupType?.trim().slice(0, 100) || null,
    rating: parsedRating, quote: quote.trim().slice(0, 1200), storyTitle: storyTitle?.trim().slice(0, 180) || null, storySummary: storySummary?.trim().slice(0, 600) || null,
    storyBody: storyBody?.trim().slice(0, 8000) || null, displayConsent: true, submittedAt: new Date(),
  };
  const claimed = await prisma.websiteReviewRequest.updateMany({ where: { id: request.id, status: 'open', expiresAt: { gt: new Date() } }, data });
  if (claimed.count !== 1) return res.status(409).json({ error: 'This review link is no longer available.' });
  const adminUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/website?tab=reviews`;
  try {
    await sendMail({ from: buildFromHeader(), to: process.env.SUPPORT_NOTIFICATION_EMAIL || 'shayalieberman@gmail.com', subject: `[Review submitted] ${data.groupName}`, html: buildActionEmailHtml({ heading: 'A customer review is ready', bodyHtml: `<p><strong>${escapeHtml(data.groupName)}</strong> submitted a ${parsedRating}-star review.</p><p>Review and approve or decline it in the website admin. It will not be published automatically.</p>`, buttonText: 'Review submission', buttonUrl: adminUrl }) });
  } catch (err) {
    console.error(`Failed to email review-submission notification for ${request.id}:`, err);
  }
  res.status(201).json({ ok: true });
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
