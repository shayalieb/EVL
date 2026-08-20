import { Router } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { allPermissions, getMembershipWithAccount, serializeMembership } from '../lib/membership.js';
import { sendMail, buildFromHeader, escapeHtml } from '../lib/mailer.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { MIN_PASSWORD_LENGTH, passwordTooWeak } from '../lib/password.js';
import { SIGNUP_VERTICALS } from '../lib/verticals.js';

const router = Router();
const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// Any valid bcrypt hash at the same cost factor as SALT_ROUNDS works here —
// its plaintext is irrelevant, since login always compares against it and
// discards the result. Only exists so a nonexistent-email login takes the
// same time as a wrong-password one (see POST /login below); without it,
// skipping bcrypt.compare entirely for a nonexistent user is measurably
// faster and lets a login attempt be used to enumerate valid emails.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

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

function sanitize(user, membership) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return { ...safe, ...serializeMembership(membership) };
}

// A new self-signup starts unapproved (Account.approvedAt is left null —
// see the transaction below) and nothing else surfaces that fact, so
// without this the account would just sit there until someone happened to
// check the admin panel. Best-effort, same shape as support.js's
// notifyAdmin — the signup itself already succeeded regardless of whether
// this send does.
async function notifyPendingSignup(user) {
  const to = process.env.SUPPORT_NOTIFICATION_EMAIL || 'shayalieberman@gmail.com';
  const adminUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/accounts`;
  try {
    await sendMail({
      from: buildFromHeader(),
      to,
      subject: `[New Signup] ${user.firstName} ${user.lastName}`,
      html: `<p>${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)} (${escapeHtml(user.email)}) just signed up and is awaiting approval.</p><p><a href="${adminUrl}">Review in the admin panel</a></p>`,
    });
  } catch {
    // best effort
  }
}

router.post('/signup', credentialsLimiter, asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, password, vertical } = req.body || {};
  if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
  }
  if (passwordTooWeak(password)) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  // Falls back to the schema default rather than 400ing on a missing/invalid
  // value, so an old or cached signup form never hard-fails signup itself —
  // same fallback for a currently-deactivated vertical (see
  // SIGNUP_VERTICALS) as for a genuinely-invalid one.
  const accountVertical = SIGNUP_VERTICALS.includes(vertical) ? vertical : undefined;

  try {
    const { user, membership, account } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail, phone: phone || null, passwordHash },
      });
      const account = await tx.account.create({ data: accountVertical ? { vertical: accountVertical } : {} });
      const membership = await tx.membership.create({
        data: { userId: user.id, accountId: account.id, role: 'owner', permissions: allPermissions() },
      });
      return { user, membership, account };
    });
    req.session.userId = user.id;
    await notifyPendingSignup(user);
    res.status(201).json({ user: sanitize(user, { ...membership, account }) });
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
  const match = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!user?.passwordHash || !match) {
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
  if (passwordTooWeak(newPassword)) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
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
    const token = generateToken();
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
    } catch (err) {
      // best effort — don't let a mail-provider hiccup change the response
      // below, which must stay identical whether or not the email matched.
      console.error(`Failed to email password reset link to user ${user.id}:`, err);
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
  if (passwordTooWeak(newPassword)) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
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
