import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();
const SALT_ROUNDS = 12;

function sanitize(user) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

router.post('/signup', asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body || {};
  if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail, phone: phone || null, passwordHash },
    });
    req.session.userId = user.id;
    res.status(201).json({ user: sanitize(user) });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    throw err;
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const match = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!match) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  req.session.userId = user.id;
  res.json({ user: sanitize(user) });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', asyncHandler(async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  res.json({ user: sanitize(user) });
}));

router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  const match = user?.passwordHash ? await bcrypt.compare(currentPassword || '', user.passwordHash) : true;
  if (!match) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
}));

export default router;
