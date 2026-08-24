import { Router } from 'express';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';
import { paginationFromRequest, paginatedResponse } from '../lib/pagination.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { sendMail, resolveFromHeader, escapeHtml, buildActionEmailHtml } from '../lib/mailer.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

function serializeCalendarLink(link) {
  return {
    calendarLink: `${frontendUrl()}/gigs/${link.publicToken}`,
    showConfirmed: link.showConfirmed,
    showTentative: link.showTentative,
  };
}

function serializeContractor(c) {
  return {
    id: c.id,
    firstName: c.firstName,
    middleName: c.middleName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    contractorType1: c.contractorType1,
    contractorType2: c.contractorType2,
    pricingTiers: c.pricingTiers,
    priceNotes: c.priceNotes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const pagination = paginationFromRequest(req);
  if (!pagination) return res.status(400).json({ error: 'Invalid pagination cursor.' });
  const contractors = await prisma.contractor.findMany({
    where: { accountId: req.membership.accountId, ...pagination.cursorWhere },
    orderBy: pagination.orderBy,
    take: pagination.limit + 1,
  });
  const { page, nextCursor } = paginatedResponse(contractors, pagination.limit);
  res.json({ contractors: page.map(serializeContractor), nextCursor });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageContractors) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { id, firstName, lastName, middleName, email, phone, contractorType1, contractorType2, pricingTiers, priceNotes } = req.body || {};
  if (!id?.trim()) {
    return res.status(400).json({ error: 'id is required.' });
  }
  if (!firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }

  const contractor = await createWithPreservedId(prisma.contractor, {
    id,
    accountId: req.membership.accountId,
    firstName: firstName.trim(),
    middleName: middleName?.trim() || null,
    lastName: lastName.trim(),
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    contractorType1: contractorType1 || null,
    contractorType2: contractorType2 || null,
    pricingTiers: Array.isArray(pricingTiers) ? pricingTiers : [],
    priceNotes: priceNotes?.trim() || null,
  }, req.membership.accountId);
  res.status(201).json({ contractor: serializeContractor(contractor) });
}));

// Real external email out to an arbitrary chunk of the roster, so this is
// permission-gated (manageContractors — the page it's driven from) and
// rate-limited the same way email.js's single-send /send route is.
const bulkEmailLimiter = createRateLimiter('contractor-bulk-email', {
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: 'Too many bulk sends. Please try again later.' },
});

// One request handles the whole selected batch (rather than the client
// firing one call per contractor) so a single send action gets a single
// rate-limit slot and one clear "N sent, M skipped" result instead of
// juggling N separate in-flight requests client-side.
router.post('/bulk-email', bulkEmailLimiter, asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageContractors) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { contractorIds, subject, body, fromName } = req.body || {};
  if (!Array.isArray(contractorIds) || !contractorIds.length) {
    return res.status(400).json({ error: 'Select at least one contractor.' });
  }
  if (!subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Subject and body are required.' });
  }

  const contractors = await prisma.contractor.findMany({
    where: { id: { in: contractorIds }, accountId: req.membership.accountId },
  });

  const withEmail = contractors.filter((c) => c.email);
  const skipped = contractors
    .filter((c) => !c.email)
    .map((c) => ({ contractorId: c.id, name: `${c.firstName} ${c.lastName}`.trim(), reason: 'No email on file' }));

  let from, html;
  try {
    const accountData = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId } });
    const businessInfo = accountData?.data?.businessInfo || {};
    from = await resolveFromHeader({ accountId: req.membership.accountId, fromName, localPart: 'hello' });
    html = buildActionEmailHtml({ businessInfo, bodyHtml: body });
  } catch {
    return res.status(503).json({ error: 'Email sending is not configured yet.' });
  }

  const results = await Promise.allSettled(
    withEmail.map((c) => sendMail({ from, to: c.email, subject, html }).then((r) => {
      if (r.error) throw new Error(r.error.message || 'Failed to send.');
      return c;
    }))
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const c = withEmail[i];
      skipped.push({ contractorId: c.id, name: `${c.firstName} ${c.lastName}`.trim(), reason: r.reason?.message || 'Failed to send.' });
    }
  });

  res.json({ sentCount: results.filter((r) => r.status === 'fulfilled').length, skipped });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageContractors) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.contractor.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contractor not found.' });
  }

  const { firstName, lastName, middleName, email, phone, contractorType1, contractorType2, pricingTiers, priceNotes } = req.body || {};
  const data = {};
  if (firstName !== undefined) {
    if (!firstName.trim()) return res.status(400).json({ error: 'First name is required.' });
    data.firstName = firstName.trim();
  }
  if (lastName !== undefined) {
    if (!lastName.trim()) return res.status(400).json({ error: 'Last name is required.' });
    data.lastName = lastName.trim();
  }
  if (middleName !== undefined) data.middleName = middleName?.trim() || null;
  if (email !== undefined) data.email = email?.trim() || null;
  if (phone !== undefined) data.phone = phone?.trim() || null;
  if (contractorType1 !== undefined) data.contractorType1 = contractorType1 || null;
  if (contractorType2 !== undefined) data.contractorType2 = contractorType2 || null;
  if (pricingTiers !== undefined) data.pricingTiers = Array.isArray(pricingTiers) ? pricingTiers : [];
  if (priceNotes !== undefined) data.priceNotes = priceNotes?.trim() || null;

  const contractor = await prisma.contractor.update({ where: { id: existing.id }, data });
  res.json({ contractor: serializeContractor(contractor) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageContractors) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.contractor.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contractor not found.' });
  }
  await prisma.contractor.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// Get-or-create — always returns a usable link, same shape as
// guests.js's GET /rsvp-link. One persistent link per contractor (unique
// [accountId, contractorId]) meant to be bookmarked/added to a home
// screen — see the ContractorCalendarLink model comment for why it's
// deliberately non-expiring, unlike the client portal's magic link.
router.get('/:id/calendar-link', asyncHandler(async (req, res) => {
  const existing = await prisma.contractor.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contractor not found.' });
  }

  let link = await prisma.contractorCalendarLink.findUnique({
    where: { accountId_contractorId: { accountId: req.membership.accountId, contractorId: req.params.id } },
  });
  if (!link) {
    const token = generateToken();
    link = await prisma.contractorCalendarLink.create({
      data: { accountId: req.membership.accountId, contractorId: req.params.id, tokenHash: hashToken(token), publicToken: token },
    });
  }
  res.json(serializeCalendarLink(link));
}));

// Owner-configurable visibility (see the ContractorCalendarLink model
// comment) — get-or-create first, same as the GET above, since a business
// might toggle these before ever having copied/emailed the link.
router.patch('/:id/calendar-link', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageContractors) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.contractor.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contractor not found.' });
  }

  const { showConfirmed, showTentative } = req.body || {};
  const data = {};
  if (showConfirmed !== undefined) data.showConfirmed = !!showConfirmed;
  if (showTentative !== undefined) data.showTentative = !!showTentative;

  const token = generateToken();
  const link = await prisma.contractorCalendarLink.upsert({
    where: { accountId_contractorId: { accountId: req.membership.accountId, contractorId: req.params.id } },
    update: data,
    create: { accountId: req.membership.accountId, contractorId: req.params.id, tokenHash: hashToken(token), publicToken: token, ...data },
  });
  res.json(serializeCalendarLink(link));
}));

// Rotates the link's token — the previously-shared URL stops working (e.g.
// a contractor lost their phone, or the link leaked), a fresh one is
// returned to re-share. Visibility settings are untouched (not part of
// `update` below), so regenerating doesn't reset what the contractor's
// allowed to see.
router.post('/:id/calendar-link/regenerate', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageContractors) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.contractor.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contractor not found.' });
  }

  const token = generateToken();
  const link = await prisma.contractorCalendarLink.upsert({
    where: { accountId_contractorId: { accountId: req.membership.accountId, contractorId: req.params.id } },
    update: { tokenHash: hashToken(token), publicToken: token },
    create: { accountId: req.membership.accountId, contractorId: req.params.id, tokenHash: hashToken(token), publicToken: token },
  });
  res.json(serializeCalendarLink(link));
}));

// Emails the contractor their own calendar link (get-or-create first, same
// as GET above — a business might email it before ever copying it).
router.post('/:id/calendar-link/email', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageContractors) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.contractor.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contractor not found.' });
  }
  if (!existing.email) {
    return res.status(400).json({ error: 'This contractor has no email address on file.' });
  }

  let link = await prisma.contractorCalendarLink.findUnique({
    where: { accountId_contractorId: { accountId: req.membership.accountId, contractorId: req.params.id } },
  });
  if (!link) {
    const token = generateToken();
    link = await prisma.contractorCalendarLink.create({
      data: { accountId: req.membership.accountId, contractorId: req.params.id, tokenHash: hashToken(token), publicToken: token },
    });
  }

  const accountData = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId } });
  const businessInfo = accountData?.data?.businessInfo || {};
  const fromName = businessInfo.name || 'GigWorks';
  const calendarLink = `${frontendUrl()}/gigs/${link.publicToken}`;

  await sendMail({
    from: await resolveFromHeader({ accountId: req.membership.accountId, fromName, localPart: 'gigs' }),
    to: existing.email,
    subject: `Your gig calendar — ${fromName}`,
    html: buildActionEmailHtml({
      businessInfo,
      heading: 'Your Gig Calendar',
      bodyHtml: `<p>Hi ${escapeHtml(existing.firstName)}, here's your personal link to see your upcoming gigs with ${escapeHtml(fromName)} — bookmark it, or add it to your phone's home screen for quick access anytime.</p>`,
      buttonText: 'View My Gigs',
      buttonUrl: calendarLink,
    }),
  });

  res.json(serializeCalendarLink(link));
}));

export default router;
