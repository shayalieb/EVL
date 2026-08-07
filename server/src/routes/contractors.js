import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

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
  const contractors = await prisma.contractor.findMany({
    where: { accountId: req.membership.accountId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ contractors: contractors.map(serializeContractor) });
}));

router.post('/', asyncHandler(async (req, res) => {
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

router.patch('/:id', asyncHandler(async (req, res) => {
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
  const existing = await prisma.contractor.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contractor not found.' });
  }
  await prisma.contractor.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
