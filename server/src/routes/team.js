import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, requireRole, sanitizePermissions, effectivePermissions } from '../lib/membership.js';

const router = Router();
const SALT_ROUNDS = 12;

router.use(requireAuth, asyncHandler(attachMembership), requireRole('owner', 'admin'));

function serializeMember(m) {
  return {
    id: m.id,
    userId: m.userId,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    role: m.role,
    permissions: effectivePermissions(m),
    createdAt: m.createdAt,
  };
}

router.get('/members', asyncHandler(async (req, res) => {
  const members = await prisma.membership.findMany({
    where: { accountId: req.membership.accountId },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ members: members.map(serializeMember) });
}));

router.post('/members', asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, permissions } = req.body || {};
  if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const membership = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail, passwordHash },
    });
    return tx.membership.create({
      data: {
        userId: user.id,
        accountId: req.membership.accountId,
        role: 'member',
        permissions: sanitizePermissions(permissions),
      },
      include: { user: true },
    });
  });

  res.status(201).json({ member: serializeMember(membership) });
}));

router.patch('/members/:id', asyncHandler(async (req, res) => {
  const target = await prisma.membership.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!target || target.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Member not found.' });
  }
  if (target.role === 'owner') {
    return res.status(403).json({ error: "The owner's role can't be changed." });
  }

  const { role, permissions } = req.body || {};
  const data = {};

  if (role !== undefined && role !== target.role) {
    if (req.membership.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can change roles.' });
    }
    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    data.role = role;
  }

  if (permissions !== undefined) {
    const effectiveTargetRole = data.role || target.role;
    if (effectiveTargetRole !== 'member') {
      return res.status(400).json({ error: 'Permissions only apply to members.' });
    }
    if (target.role === 'admin' && req.membership.role !== 'owner') {
      return res.status(403).json({ error: 'Admins cannot modify other admins.' });
    }
    data.permissions = sanitizePermissions(permissions);
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  const updated = await prisma.membership.update({ where: { id: target.id }, data, include: { user: true } });
  res.json({ member: serializeMember(updated) });
}));

router.delete('/members/:id', asyncHandler(async (req, res) => {
  const target = await prisma.membership.findUnique({ where: { id: req.params.id } });
  if (!target || target.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Member not found.' });
  }
  if (target.role === 'owner') {
    return res.status(403).json({ error: 'The owner cannot be removed.' });
  }
  if (target.id === req.membership.id) {
    return res.status(403).json({ error: "You can't remove your own access." });
  }
  if (target.role === 'admin' && req.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can remove an admin.' });
  }
  await prisma.membership.delete({ where: { id: target.id } });
  res.json({ ok: true });
}));

export default router;
