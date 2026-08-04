import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, requireRole } from '../lib/membership.js';
import { provisionEmailDomain, provisionCustomEmailDomain, refreshEmailDomainStatus, getEmailDomain } from '../lib/emailDomains.js';
import { ROOT_DOMAIN } from '../lib/godaddyDns.js';

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

export default router;
