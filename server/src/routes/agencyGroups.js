import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { contractorAssignmentCost } from '../lib/financialReports.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function requireAgency(req, res, next) {
  if (req.membership.account.planTier !== 'agency') return res.status(403).json({ error: 'Agency workspace access is required.' });
  next();
}
router.use(requireAgency);

function cleanStationery(input = {}) {
  const addressLine1 = String(input.addressLine1 || input.address || '').trim().slice(0, 160);
  const addressLine2 = String(input.addressLine2 || '').trim().slice(0, 100);
  const city = String(input.city || '').trim().slice(0, 100);
  const state = String(input.state || '').trim().slice(0, 100);
  const postalCode = String(input.postalCode || '').trim().slice(0, 30);
  const country = String(input.country || '').trim().slice(0, 100);
  const locality = [city, state, postalCode].filter(Boolean).join(', ').replace(/, ([^,]+),/, ', $1 ');
  return {
    businessName: String(input.businessName || '').trim().slice(0, 140),
    address: [addressLine1, addressLine2, locality, country].filter(Boolean).join(', ').slice(0, 500),
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country,
    phone: String(input.phone || '').trim().slice(0, 40),
    email: String(input.email || '').trim().slice(0, 254),
    accentColor: /^#[0-9a-f]{6}$/i.test(input.accentColor || '') ? input.accentColor : '#6366f1',
    documentLayout: ['classic', 'modern', 'minimal'].includes(input.documentLayout) ? input.documentLayout : 'classic',
    footer: String(input.footer || '').trim().slice(0, 500),
  };
}

function cleanLogo(input) {
  const logo = String(input || '').trim();
  if (!logo) return null;
  const isImageData = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(logo);
  const isWebUrl = /^https:\/\/[^\s]+$/i.test(logo);
  if ((!isImageData && !isWebUrl) || logo.length > 750000) {
    const error = new Error('Upload a valid PNG, JPG, or WebP logo.');
    error.status = 400;
    throw error;
  }
  return logo;
}

function serialize(group, stats = {}) {
  return { ...group, stationery: group.stationery || {}, stats: { activeBookings: 0, upcomingEvents: 0, completedEvents: 0, invoicedRevenue: null, outstandingBalance: null, contractorDue: null, nextEvent: null, canDelete: true, ...stats } };
}

function invoiceValue(invoice) {
  return (invoice.snapshot?.lineItems || []).reduce((sum, item) => sum + (item?.type === 'perUnit' ? (Number(item.unitCount) || 0) * (Number(item.ratePerUnit) || 0) : Number(item?.amount) || 0), 0);
}

router.get('/', asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const groups = await prisma.agencyGroup.findMany({ where: { accountId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  const includeFinancials = effectivePermissions(req.membership).viewFinancials;
  const [bookings, events, invoices, contractors, transactionCounts, budgetCounts, periodCounts] = await Promise.all([
    prisma.booking.findMany({ where: { accountId, groupId: { not: null } }, select: { id: true, groupId: true, completedAt: true, deletedAt: true } }),
    prisma.event.findMany({ where: { accountId, groupId: { not: null } }, select: { groupId: true, name: true, eventDate: true, completedAt: true, deletedAt: true, contractorBookings: includeFinancials } }),
    includeFinancials ? prisma.invoice.findMany({ where: { accountId, status: { not: 'void' } }, select: { bookingId: true, snapshot: true, paidAmount: true, status: true } }) : [],
    includeFinancials ? prisma.contractor.findMany({ where: { accountId }, select: { id: true, pricingTiers: true } }) : [],
    prisma.financialTransaction.groupBy({ by: ['groupId'], where: { accountId, groupId: { not: null } }, _count: { _all: true } }),
    prisma.financialBudget.groupBy({ by: ['groupId'], where: { accountId, groupId: { not: null } }, _count: { _all: true } }),
    prisma.financialPeriod.groupBy({ by: ['groupId'], where: { accountId, groupId: { not: null } }, _count: { _all: true } }),
  ]);
  const stats = new Map(groups.map((group) => [group.id, { activeBookings: 0, upcomingEvents: 0, completedEvents: 0, invoicedRevenue: includeFinancials ? 0 : null, outstandingBalance: includeFinancials ? 0 : null, contractorDue: includeFinancials ? 0 : null, nextEvent: null, canDelete: true }]));
  const bookingGroups = new Map();
  bookings.forEach((booking) => { bookingGroups.set(booking.id, booking.groupId); const item = stats.get(booking.groupId); if (item) { item.canDelete = false; if (!booking.deletedAt && !booking.completedAt) item.activeBookings += 1; } });
  const today = new Date().toISOString().slice(0, 10);
  const contractorById = new Map(contractors.map((contractor) => [contractor.id, contractor]));
  events.forEach((event) => {
    const item = stats.get(event.groupId);
    if (!item) return;
    item.canDelete = false;
    if (event.deletedAt) return;
    item[event.completedAt ? 'completedEvents' : 'upcomingEvents'] += 1;
    if (!event.completedAt && event.eventDate && event.eventDate >= today && (!item.nextEvent || event.eventDate < item.nextEvent.date)) item.nextEvent = { name: event.name || 'Untitled event', date: event.eventDate };
    if (includeFinancials) for (const assignment of event.contractorBookings || []) {
      if (assignment.paymentStatus === 'paid') continue;
      item.contractorDue += contractorAssignmentCost(assignment, contractorById.get(assignment.contractorId)) || 0;
    }
  });
  if (includeFinancials) invoices.forEach((invoice) => {
    const item = stats.get(bookingGroups.get(invoice.bookingId));
    if (!item) return;
    const total = invoiceValue(invoice);
    item.invoicedRevenue += total;
    if (['sent', 'partial'].includes(invoice.status)) item.outstandingBalance += Math.max(0, total - (Number(invoice.paidAmount) || 0));
  });
  [...transactionCounts, ...budgetCounts, ...periodCounts].forEach((row) => { const item = stats.get(row.groupId); if (item && row._count._all > 0) item.canDelete = false; });
  res.json({ groups: groups.map((group) => serialize(group, stats.get(group.id))) });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) return res.status(403).json({ error: 'Not authorized.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Group name is required.' });
  const [account, groupCount] = await Promise.all([prisma.account.findUnique({ where: { id: req.membership.accountId }, select: { agencyGroupLimit: true } }), prisma.agencyGroup.count({ where: { accountId: req.membership.accountId, active: true } })]);
  if (account?.agencyGroupLimit && groupCount >= account.agencyGroupLimit) return res.status(409).json({ error: `Your Agency plan includes ${account.agencyGroupLimit} active groups. Increase the group count in Plan settings before adding another.` });
  const group = await prisma.agencyGroup.create({ data: { accountId: req.membership.accountId, name: name.slice(0, 140), description: String(req.body?.description || '').trim().slice(0, 2000) || null, logo: cleanLogo(req.body?.logo), stationery: cleanStationery(req.body?.stationery) } });
  res.status(201).json({ group: serialize(group) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.agencyGroup.findFirst({ where: { id: req.params.id, accountId: req.membership.accountId } });
  if (!existing) return res.status(404).json({ error: 'Group not found.' });
  if (req.body?.active === true && !existing.active) {
    const [account, activeCount] = await Promise.all([prisma.account.findUnique({ where: { id: req.membership.accountId }, select: { agencyGroupLimit: true } }), prisma.agencyGroup.count({ where: { accountId: req.membership.accountId, active: true } })]);
    if (account?.agencyGroupLimit && activeCount >= account.agencyGroupLimit) return res.status(409).json({ error: `Your Agency plan includes ${account.agencyGroupLimit} active groups. Increase the group count before restoring this group.` });
  }
  const data = {};
  if (req.body?.name !== undefined) { const name = String(req.body.name).trim(); if (!name) return res.status(400).json({ error: 'Group name is required.' }); data.name = name.slice(0, 140); }
  if (req.body?.description !== undefined) data.description = String(req.body.description).trim().slice(0, 2000) || null;
  if (req.body?.logo !== undefined) data.logo = cleanLogo(req.body.logo);
  if (req.body?.stationery !== undefined) data.stationery = cleanStationery(req.body.stationery);
  if (req.body?.active !== undefined) data.active = req.body.active === true;
  const group = await prisma.agencyGroup.update({ where: { id: existing.id }, data });
  res.json({ group: serialize(group) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.agencyGroup.findFirst({ where: { id: req.params.id, accountId: req.membership.accountId } });
  if (!existing) return res.status(404).json({ error: 'Group not found.' });
  const [bookings, events, transactions, budgets, periods] = await Promise.all([prisma.booking.count({ where: { accountId: req.membership.accountId, groupId: existing.id } }), prisma.event.count({ where: { accountId: req.membership.accountId, groupId: existing.id } }), prisma.financialTransaction.count({ where: { accountId: req.membership.accountId, groupId: existing.id } }), prisma.financialBudget.count({ where: { accountId: req.membership.accountId, groupId: existing.id } }), prisma.financialPeriod.count({ where: { accountId: req.membership.accountId, groupId: existing.id } })]);
  if (bookings || events || transactions || budgets || periods) return res.status(409).json({ error: 'This group has workflow or financial history. Archive it instead so its records remain available.' });
  await prisma.agencyGroup.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
