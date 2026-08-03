import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

router.get('/', asyncHandler(async (req, res) => {
  const reminders = await prisma.reminder.findMany({
    where: { accountId: req.membership.accountId },
    orderBy: { remindAt: 'asc' },
  });
  res.json({ reminders });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { relatedType, relatedId, relatedName, note, remindAt, emailEnabled } = req.body || {};
  if (!note?.trim()) return res.status(400).json({ error: 'note is required.' });
  if (!remindAt || Number.isNaN(new Date(remindAt).getTime())) {
    return res.status(400).json({ error: 'remindAt is required.' });
  }

  const reminder = await prisma.reminder.create({
    data: {
      accountId: req.membership.accountId,
      createdByUserId: req.session.userId,
      relatedType: relatedType || null,
      relatedId: relatedId || null,
      relatedName: relatedName || null,
      note: note.trim(),
      remindAt: new Date(remindAt),
      emailEnabled: !!emailEnabled,
    },
  });
  res.status(201).json({ reminder });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.reminder.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Reminder not found.' });
  }

  const { relatedType, relatedId, relatedName, note, remindAt, emailEnabled } = req.body || {};
  const data = {};
  if (relatedType !== undefined) data.relatedType = relatedType || null;
  if (relatedId !== undefined) data.relatedId = relatedId || null;
  if (relatedName !== undefined) data.relatedName = relatedName || null;
  if (note !== undefined) {
    if (!note.trim()) return res.status(400).json({ error: 'note is required.' });
    data.note = note.trim();
  }
  if (remindAt !== undefined) {
    if (Number.isNaN(new Date(remindAt).getTime())) return res.status(400).json({ error: 'remindAt is invalid.' });
    data.remindAt = new Date(remindAt);
    // Un-send so an edited-forward reminder can still email at its new time.
    data.emailSentAt = null;
  }
  if (emailEnabled !== undefined) data.emailEnabled = !!emailEnabled;

  const reminder = await prisma.reminder.update({ where: { id: existing.id }, data });
  res.json({ reminder });
}));

router.patch('/:id/complete', asyncHandler(async (req, res) => {
  const existing = await prisma.reminder.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Reminder not found.' });
  }

  const { completed } = req.body || {};
  const reminder = await prisma.reminder.update({
    where: { id: existing.id },
    data: { completedAt: completed ? new Date() : null },
  });
  res.json({ reminder });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.reminder.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Reminder not found.' });
  }
  await prisma.reminder.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
