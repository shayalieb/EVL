import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

router.get('/', asyncHandler(async (req, res) => {
  const { eventId } = req.query;
  if (!eventId) return res.status(400).json({ error: 'eventId is required.' });

  const documents = await prisma.eventDocument.findMany({
    where: { accountId: req.membership.accountId, eventId },
    select: { id: true, filename: true, contentType: true, size: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ documents });
}));

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File is too large (10MB max).' });
    }
    if (err) return next(err);
    next();
  });
}, asyncHandler(async (req, res) => {
  const { eventId } = req.body || {};
  if (!eventId?.trim()) return res.status(400).json({ error: 'eventId is required.' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const document = await prisma.eventDocument.create({
    data: {
      accountId: req.membership.accountId,
      eventId,
      filename: req.file.originalname,
      contentType: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      data: req.file.buffer,
    },
    select: { id: true, filename: true, contentType: true, size: true, createdAt: true },
  });
  res.status(201).json({ document });
}));

router.get('/:id/download', asyncHandler(async (req, res) => {
  const document = await prisma.eventDocument.findUnique({ where: { id: req.params.id } });
  if (!document || document.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Document not found.' });
  }
  res.setHeader('Content-Type', document.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${document.filename.replace(/"/g, '')}"`);
  res.send(document.data);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const document = await prisma.eventDocument.findUnique({ where: { id: req.params.id } });
  if (!document || document.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Document not found.' });
  }
  await prisma.eventDocument.delete({ where: { id: document.id } });
  res.json({ ok: true });
}));

export default router;
