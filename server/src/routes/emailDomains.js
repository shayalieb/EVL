import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, requireRole } from '../lib/membership.js';
import { provisionEmailDomain, provisionCustomEmailDomain, refreshEmailDomainStatus, getEmailDomain, startCustomEmailDomainReplacement, cancelEmailDomainReplacement, removeEmailDomain } from '../lib/emailDomains.js';
import { ROOT_DOMAIN } from '../lib/godaddyDns.js';
import { normalizeValidEmail } from '../lib/emailAddress.js';
import { resolveFromHeader, sendMail, buildActionEmailHtml } from '../lib/mailer.js';
import { prisma } from '../lib/prisma.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

router.get('/', asyncHandler(async (req, res) => {
  const domain = await getEmailDomain(req.membership.accountId);
  res.json({ domain, rootDomain: ROOT_DOMAIN });
}));

// Provisioning writes DNS records to the platform's own domain and can't be
// undone by re-running it (each subdomain is claimed permanently once
// taken) — same owner/admin-only gate as Billing/Users, this is
// account-wide config, not a per-member setting.
router.post('/', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const { subdomain } = req.body || {};
  try {
    const domain = await provisionEmailDomain(req.membership.accountId, subdomain);
    res.status(201).json({ domain });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));

// Same idea as POST / above but for a business's own domain — no DNS gets
// written anywhere (this app doesn't control it), so there's nothing
// destructive about re-running it, but the same owner/admin gate applies
// since it's still account-wide config.
router.post('/custom-domain', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const { domain } = req.body || {};
  try {
    const created = await provisionCustomEmailDomain(req.membership.accountId, domain);
    res.status(201).json({ domain: created });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));

router.post('/verify', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const domain = await refreshEmailDomainStatus(req.membership.accountId);
  if (!domain) return res.status(404).json({ error: 'No email domain configured yet.' });
  res.json({ domain });
}));

router.post('/replacement', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  try {
    const domain = await startCustomEmailDomainReplacement(req.membership.accountId, req.body?.domain);
    res.status(201).json({ domain });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));

router.delete('/replacement', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const domain = await cancelEmailDomainReplacement(req.membership.accountId);
  res.json({ domain });
}));

router.delete('/', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  await removeEmailDomain(req.membership.accountId);
  res.status(204).end();
}));

router.post('/test-email', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const to = normalizeValidEmail(req.body?.to);
  if (!to) return res.status(400).json({ error: 'Enter a valid test email address.' });
  const domain = await getEmailDomain(req.membership.accountId);
  if (!domain || (domain.sendingStatus !== 'verified' && domain.status !== 'verified')) return res.status(409).json({ error: 'Verify outbound sending before sending a test.' });
  const accountData = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId } });
  const businessInfo = accountData?.data?.businessInfo || {};
  const from = await resolveFromHeader({ accountId: req.membership.accountId, fromName: businessInfo.name || 'GigWorks', localPart: 'hello' });
  const { error } = await sendMail({ from, to, subject: 'GigWorks branded email test', html: buildActionEmailHtml({ businessInfo, bodyHtml: '<p>Your branded sending domain is working.</p><p>Reply to this message to test reply tracking.</p>' }) });
  if (error) return res.status(502).json({ error: error.message || 'Test email failed.' });
  await prisma.emailDomain.update({ where: { accountId: req.membership.accountId }, data: { lastTestEmailAt: new Date() } });
  res.json({ ok: true });
}));

export default router;
