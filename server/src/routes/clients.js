import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function serializeClient(c) {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    address1: c.address1,
    address2: c.address2,
    city: c.city,
    state: c.state,
    zip: c.zip,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const clients = await prisma.client.findMany({
    where: { accountId: req.membership.accountId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ clients: clients.map(serializeClient) });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { id, firstName, lastName, email, phone, address1, address2, city, state, zip, notes } = req.body || {};
  if (!id?.trim()) {
    return res.status(400).json({ error: 'id is required.' });
  }
  if (!firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }

  const client = await createWithPreservedId(prisma.client, {
    id,
    accountId: req.membership.accountId,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    address1: address1?.trim() || null,
    address2: address2?.trim() || null,
    city: city?.trim() || null,
    state: state?.trim() || null,
    zip: zip?.trim() || null,
    notes: notes?.trim() || null,
  }, req.membership.accountId);
  res.status(201).json({ client: serializeClient(client) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Client not found.' });
  }

  const { firstName, lastName, email, phone, address1, address2, city, state, zip, notes } = req.body || {};
  const data = {};
  if (firstName !== undefined) {
    if (!firstName.trim()) return res.status(400).json({ error: 'First name is required.' });
    data.firstName = firstName.trim();
  }
  if (lastName !== undefined) {
    if (!lastName.trim()) return res.status(400).json({ error: 'Last name is required.' });
    data.lastName = lastName.trim();
  }
  if (email !== undefined) data.email = email?.trim() || null;
  if (phone !== undefined) data.phone = phone?.trim() || null;
  if (address1 !== undefined) data.address1 = address1?.trim() || null;
  if (address2 !== undefined) data.address2 = address2?.trim() || null;
  if (city !== undefined) data.city = city?.trim() || null;
  if (state !== undefined) data.state = state?.trim() || null;
  if (zip !== undefined) data.zip = zip?.trim() || null;
  if (notes !== undefined) data.notes = notes?.trim() || null;

  const client = await prisma.client.update({ where: { id: existing.id }, data });
  res.json({ client: serializeClient(client) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Client not found.' });
  }
  await prisma.client.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
