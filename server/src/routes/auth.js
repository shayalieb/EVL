import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { allPermissions, getMembershipWithAccount, serializeMembership } from '../lib/membership.js';
import { sendMail, buildFromHeader } from '../lib/mailer.js';

const router = Router();
const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// Keyed by IP (via `trust proxy`, set in index.js, so this reads the real
// client IP behind Railway's proxy rather than Railway's own address).
// Generous enough that a real user mistyping a password a few times never
// notices, tight enough to make brute-forcing credentials impractical.
const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// Stricter — bounds both reset-token guessing and using someone else's
// inbox as a spam target via repeated forgot-password requests.
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sanitize(user, membership) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return { ...safe, ...serializeMembership(membership) };
}

router.post('/signup', credentialsLimiter, asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body || {};
  if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const { user, membership } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail, phone: phone || null, passwordHash },
      });
      const account = await tx.account.create({ data: {} });
      const membership = await tx.membership.create({
        data: { userId: user.id, accountId: account.id, role: 'owner', permissions: allPermissions() },
      });
      return { user, membership };
    });
    req.session.userId = user.id;
    res.status(201).json({ user: sanitize(user, membership) });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    throw err;
  }
}));

router.post('/login', credentialsLimiter, asyncHandler(async (req, res) => {
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
  const membership = await getMembershipWithAccount(user.id);
  res.json({ user: sanitize(user, membership) });
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
  const membership = await getMembershipWithAccount(user.id);
  res.json({ user: sanitize(user, membership) });
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

router.post('/forgot-password', passwordResetLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email?.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    try {
      await sendMail({
        from: buildFromHeader(),
        to: normalizedEmail,
        subject: 'Reset your GigWorks password',
        html: `<p>Click below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      });
    } catch {
      // best effort — don't let a mail-provider hiccup change the response
      // below, which must stay identical whether or not the email matched.
    }
  }

  // Always the same response, whether or not the email matched an account —
  // avoids leaking which emails have accounts.
  res.json({ ok: true });
}));

router.post('/reset-password', passwordResetLimiter, asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  res.json({ ok: true });
}));

export default router;
