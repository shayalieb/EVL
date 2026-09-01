import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, requireRole, sanitizePermissions, effectivePermissions } from '../lib/membership.js';
import { normalizeValidEmail } from '../lib/emailAddress.js';
import { generateToken, hashToken } from '../lib/resetToken.js';
import { resolveLinkExpiration, linkAvailability } from '../lib/linkExpiration.js';
import { sendMail, resolveFromHeader, escapeHtml, buildActionEmailHtml } from '../lib/mailer.js';

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

function latestInvite(user) {
  return user.passwordResetTokens?.find((token) => token.purpose === 'team_invite') || null;
}

router.use(requireAuth, asyncHandler(attachMembership), requireRole('owner', 'admin'));

function serializeMember(m) {
  const invite = latestInvite(m.user);
  return {
    id: m.id,
    userId: m.userId,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    role: m.role,
    permissions: effectivePermissions(m),
    createdAt: m.createdAt,
    invitation: invite ? {
      status: linkAvailability({ expiresAt: invite.expiresAt, revokedAt: invite.revokedAt, usedAt: invite.usedAt, singleUse: true }).status,
      expiresAt: invite.expiresAt,
      sentAt: invite.createdAt,
    } : null,
  };
}

router.get('/members', asyncHandler(async (req, res) => {
  const members = await prisma.membership.findMany({
    where: { accountId: req.membership.accountId },
    include: { user: { include: { passwordResetTokens: { orderBy: { createdAt: 'desc' } } } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ members: members.map(serializeMember) });
}));

router.post('/members', asyncHandler(async (req, res) => {
  const { firstName, lastName, email, permissions, expiration } = req.body || {};
  const normalizedEmail = normalizeValidEmail(email);
  if (!firstName?.trim() || !lastName?.trim() || !normalizedEmail) {
    return res.status(400).json({ error: 'First name, last name, and a valid email address are required.' });
  }
  const resolvedExpiration = resolveLinkExpiration(expiration, { defaultPreset: '7_days' });
  if (resolvedExpiration.error) return res.status(400).json({ error: resolvedExpiration.error });

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  // Null seatLimit (accounts that predate billing, or admin-created ones —
  // see membership.js's isSubscriptionBlocked comment) is never capped.
  const account = await prisma.account.findUnique({ where: { id: req.membership.accountId } });
  if (account.seatLimit != null) {
    const seatCount = await prisma.membership.count({ where: { accountId: req.membership.accountId } });
    if (seatCount >= account.seatLimit) {
      return res.status(400).json({ error: `You've reached your plan's limit of ${account.seatLimit} team member${account.seatLimit === 1 ? '' : 's'}. Upgrade your plan to add more.` });
    }
  }

  const token = generateToken();
  const membership = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail, passwordHash: null },
    });
    const created = await tx.membership.create({
      data: {
        userId: user.id,
        accountId: req.membership.accountId,
        role: 'member',
        permissions: sanitizePermissions(permissions),
      },
      include: { user: { include: { passwordResetTokens: true } } },
    });
    await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), purpose: 'team_invite', expiresAt: resolvedExpiration.expiresAt } });
    await tx.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'team_member_added', summary: `${created.user.firstName} ${created.user.lastName} joined the team`, metadata: { role: created.role } } });
    return created;
  });

  const accountName = 'your GigWorks team';
  const setupUrl = `${frontendUrl()}/reset-password?token=${encodeURIComponent(token)}&invite=1`;
  await sendMail({
    from: await resolveFromHeader({ accountId: req.membership.accountId, fromName: accountName, localPart: 'team' }),
    to: normalizedEmail,
    subject: `You're invited to join ${accountName}`,
    html: buildActionEmailHtml({ heading: `Join ${escapeHtml(accountName)}`, bodyHtml: '<p>Set your password to accept your invitation and access the account.</p>', buttonText: 'Accept invitation', buttonUrl: setupUrl }),
  });

  const invitedMembership = await prisma.membership.findUnique({
    where: { id: membership.id },
    include: { user: { include: { passwordResetTokens: { orderBy: { createdAt: 'desc' } } } } },
  });
  res.status(201).json({ member: serializeMember(invitedMembership) });
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

  const updated = await prisma.$transaction(async (tx) => {
    const member = await tx.membership.update({ where: { id: target.id }, data, include: { user: true } });
    await tx.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'team_member_updated', summary: `${member.user.firstName} ${member.user.lastName}'s access was updated`, metadata: { fromRole: target.role, toRole: member.role } } });
    return member;
  });
  res.json({ member: serializeMember(updated) });
}));

router.delete('/members/:id', asyncHandler(async (req, res) => {
  const target = await prisma.membership.findUnique({ where: { id: req.params.id }, include: { user: true } });
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
  await prisma.$transaction(async (tx) => {
    await tx.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'team_member_removed', summary: `${target.user.firstName} ${target.user.lastName} was removed from the team`, metadata: { role: target.role } } });
    await tx.membership.delete({ where: { id: target.id } });
  });
  res.json({ ok: true });
}));

export default router;
