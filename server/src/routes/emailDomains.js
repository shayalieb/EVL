import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, requireRole } from '../lib/membership.js';
import { provisionEmailDomain, refreshEmailDomainStatus, getEmailDomain } from '../lib/emailDomains.js';
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

router.post('/verify', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const domain = await refreshEmailDomainStatus(req.membership.accountId);
  if (!domain) return res.status(404).json({ error: 'No email domain configured yet.' });
  res.json({ domain });
}));

export default router;
