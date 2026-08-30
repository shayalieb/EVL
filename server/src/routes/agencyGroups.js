import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function requireAgency(req, res, next) {
  if (req.membership.account.planTier !== 'agency') return res.status(403).json({ error: 'Agency workspace access is required.' });
  next();
}
router.use(requireAgency);

function cleanStationery(input = {}) {
  return {
    businessName: String(input.businessName || '').trim().slice(0, 140),
    address: String(input.address || '').trim().slice(0, 300),
    phone: String(input.phone || '').trim().slice(0, 40),
    email: String(input.email || '').trim().slice(0, 254),
    accentColor: /^#[0-9a-f]{6}$/i.test(input.accentColor || '') ? input.accentColor : '#6366f1',
    documentLayout: ['classic', 'modern', 'minimal'].includes(input.documentLayout) ? input.documentLayout : 'classic',
    footer: String(input.footer || '').trim().slice(0, 500),
  };
}

function serialize(group, stats = {}) {
  return { ...group, stationery: group.stationery || {}, stats: { activeBookings: 0, upcomingEvents: 0, completedEvents: 0, revenue: 0, ...stats } };
}

router.get('/', asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const groups = await prisma.agencyGroup.findMany({ where: { accountId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  const [bookingStats, eventStats] = await Promise.all([
    prisma.booking.groupBy({ by: ['groupId'], where: { accountId, groupId: { not: null }, deletedAt: null, completedAt: null }, _count: { _all: true }, _sum: { depositAmount: true } }),
    prisma.event.groupBy({ by: ['groupId', 'completedAt'], where: { accountId, groupId: { not: null }, deletedAt: null }, _count: { _all: true } }),
  ]);
  const stats = new Map(groups.map((group) => [group.id, { activeBookings: 0, upcomingEvents: 0, completedEvents: 0, revenue: 0 }]));
  bookingStats.forEach((row) => { const item = stats.get(row.groupId); if (item) { item.activeBookings = row._count._all; item.revenue = row._sum.depositAmount || 0; } });
  eventStats.forEach((row) => { const item = stats.get(row.groupId); if (item) item[row.completedAt ? 'completedEvents' : 'upcomingEvents'] += row._count._all; });
  res.json({ groups: groups.map((group) => serialize(group, stats.get(group.id))) });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) return res.status(403).json({ error: 'Not authorized.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Group name is required.' });
  const [account, groupCount] = await Promise.all([prisma.account.findUnique({ where: { id: req.membership.accountId }, select: { agencyGroupLimit: true } }), prisma.agencyGroup.count({ where: { accountId: req.membership.accountId, active: true } })]);
  if (account?.agencyGroupLimit && groupCount >= account.agencyGroupLimit) return res.status(409).json({ error: `Your Agency plan includes ${account.agencyGroupLimit} active groups. Increase the group count in Plan settings before adding another.` });
  const group = await prisma.agencyGroup.create({ data: { accountId: req.membership.accountId, name: name.slice(0, 140), description: String(req.body?.description || '').trim().slice(0, 2000) || null, logo: String(req.body?.logo || '').slice(0, 100000) || null, stationery: cleanStationery(req.body?.stationery) } });
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
  if (req.body?.logo !== undefined) data.logo = String(req.body.logo).slice(0, 100000) || null;
  if (req.body?.stationery !== undefined) data.stationery = cleanStationery(req.body.stationery);
  if (req.body?.active !== undefined) data.active = req.body.active === true;
  const group = await prisma.agencyGroup.update({ where: { id: existing.id }, data });
  res.json({ group: serialize(group) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.agencyGroup.findFirst({ where: { id: req.params.id, accountId: req.membership.accountId } });
  if (!existing) return res.status(404).json({ error: 'Group not found.' });
  const [bookings, events] = await Promise.all([prisma.booking.count({ where: { accountId: req.membership.accountId, groupId: existing.id } }), prisma.event.count({ where: { accountId: req.membership.accountId, groupId: existing.id } })]);
  if (bookings || events) return res.status(409).json({ error: `This group has ${bookings} booking(s) and ${events} event(s). Archive it instead of deleting it.` });
  await prisma.agencyGroup.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
