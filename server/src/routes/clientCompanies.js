import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { viewGuard } from '../lib/viewAccess.js';
import { EMPTY_SIGNALS, effectiveStage, loadClientSignals } from '../lib/clientInsights.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));
router.use(viewGuard('viewClients'));

const normalizeName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
const clean = (value, max) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};
const cleanName = (value) => clean(String(value ?? '').replace(/\s+/g, ' '), 120);

function serializeCompany(company, extra = {}) {
  return { id: company.id, name: company.name, phone: company.phone, website: company.website, notes: company.notes, createdAt: company.createdAt, ...extra };
}

async function ownedCompany(req, res) {
  const company = await prisma.clientCompany.findUnique({ where: { id: req.params.id } });
  if (!company || company.accountId !== req.membership.accountId) {
    res.status(404).json({ error: 'Company not found.' });
    return null;
  }
  return company;
}

router.get('/', asyncHandler(async (req, res) => {
  const search = normalizeName(req.query.search);
  const companies = await prisma.clientCompany.findMany({
    where: { accountId: req.membership.accountId, ...(search ? { nameNormalized: { contains: search } } : {}) },
    orderBy: { nameNormalized: 'asc' },
    take: 50,
    include: { _count: { select: { clients: true } } },
  });
  res.json({ companies: companies.map((c) => serializeCompany(c, { memberCount: c._count.clients })) });
}));

// Naming a company that already exists returns the existing one, so the
// "type a name" picker can create-or-reuse without a separate lookup.
router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) return res.status(403).json({ error: 'Not authorized.' });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'A company name is required.' });
  const accountId = req.membership.accountId;
  const nameNormalized = normalizeName(name);
  const existing = await prisma.clientCompany.findUnique({ where: { accountId_nameNormalized: { accountId, nameNormalized } } });
  if (existing) return res.json({ company: serializeCompany(existing), existed: true });
  try {
    const company = await prisma.clientCompany.create({ data: { accountId, name, nameNormalized, phone: clean(req.body?.phone, 40), website: clean(req.body?.website, 200) } });
    res.status(201).json({ company: serializeCompany(company), existed: false });
  } catch (err) {
    if (err?.code === 'P2002') {
      const raced = await prisma.clientCompany.findUnique({ where: { accountId_nameNormalized: { accountId, nameNormalized } } });
      return res.json({ company: serializeCompany(raced), existed: true });
    }
    throw err;
  }
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const company = await ownedCompany(req, res);
  if (!company) return;
  const accountId = company.accountId;
  const canMoney = !!effectivePermissions(req.membership).viewBookings;
  const members = await prisma.client.findMany({ where: { accountId, companyId: company.id }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true, email: true, phone: true, stage: true, tags: true } });
  const signals = await loadClientSignals(prisma, accountId, members.map((m) => m.id));
  const totals = { paid: 0, outstanding: 0, overdue: 0 };
  let lastContactAt = null;
  let activeMembers = 0;
  const rows = members.map((m) => {
    const sig = signals.get(m.id) || EMPTY_SIGNALS;
    if (sig.money) { totals.paid += sig.money.paid; totals.outstanding += sig.money.outstanding; totals.overdue += sig.money.overdue; }
    if (sig.lastContactAt && (!lastContactAt || sig.lastContactAt > lastContactAt)) lastContactAt = sig.lastContactAt;
    const stage = effectiveStage({ stage: m.stage, ...sig });
    if (stage === 'active') activeMembers += 1;
    return { ...m, tags: m.tags || [], effectiveStage: stage, lastContactAt: sig.lastContactAt, money: canMoney ? { paid: sig.money.paid, outstanding: sig.money.outstanding, overdue: sig.money.overdue } : null };
  });
  const round = (n) => Math.round(n * 100) / 100;
  res.json({
    company: serializeCompany(company),
    stats: { memberCount: members.length, activeMembers, lastContactAt, money: canMoney ? { paid: round(totals.paid), outstanding: round(totals.outstanding), overdue: round(totals.overdue) } : null },
    members: rows,
  });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) return res.status(403).json({ error: 'Not authorized.' });
  const company = await ownedCompany(req, res);
  if (!company) return;
  const data = {};
  if (req.body?.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'A company name is required.' });
    data.name = name;
    data.nameNormalized = normalizeName(name);
  }
  if (req.body?.phone !== undefined) data.phone = clean(req.body.phone, 40);
  if (req.body?.website !== undefined) data.website = clean(req.body.website, 200);
  if (req.body?.notes !== undefined) data.notes = clean(req.body.notes, 5000);
  try {
    const updated = await prisma.clientCompany.update({ where: { id: company.id }, data });
    res.json({ company: serializeCompany(updated) });
  } catch (err) {
    if (err?.code === 'P2002') return res.status(409).json({ error: 'Another company already has that name.' });
    throw err;
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) return res.status(403).json({ error: 'Not authorized.' });
  const company = await ownedCompany(req, res);
  if (!company) return;
  await prisma.clientCompany.delete({ where: { id: company.id } });
  res.json({ ok: true });
}));

export default router;
