import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { uploadFile, getSignedDownloadUrl, getSignedPreviewUrl, deleteFile } from '../lib/fileStorage.js';

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

  const contentType = req.file.mimetype || 'application/octet-stream';
  const storageKey = await uploadFile({ accountId: req.membership.accountId, buffer: req.file.buffer, contentType });

  const document = await prisma.eventDocument.create({
    data: {
      accountId: req.membership.accountId,
      eventId,
      filename: req.file.originalname,
      contentType,
      size: req.file.size,
      storageKey,
    },
    select: { id: true, filename: true, contentType: true, size: true, createdAt: true },
  });
  res.status(201).json({ document });
}));

// storageKey is the new (post-migration) path — signed-URL redirect, so the
// bytes never round-trip through this process. Rows uploaded before the
// storage migration only have `data`, so those still get served directly.
router.get('/:id/download', asyncHandler(async (req, res) => {
  const document = await prisma.eventDocument.findUnique({ where: { id: req.params.id } });
  if (!document || document.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Document not found.' });
  }
  if (document.storageKey) {
    return res.redirect(302, await getSignedDownloadUrl(document.storageKey, document.filename));
  }
  res.setHeader('Content-Type', document.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${document.filename.replace(/"/g, '')}"`);
  res.send(document.data);
}));

// Same lookup/ownership check as /download, but redirects to a signed URL
// without the download-forcing disposition — for rendering a file inline
// (e.g. in an <iframe>/<img> preview) rather than saving it. Pre-migration
// rows with no storageKey have no non-attachment path available, so those
// 404 here (they can still be fetched via /download).
router.get('/:id/preview', asyncHandler(async (req, res) => {
  const document = await prisma.eventDocument.findUnique({ where: { id: req.params.id } });
  if (!document || document.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Document not found.' });
  }
  if (!document.storageKey) return res.status(404).json({ error: 'Preview not available for this document.' });
  res.redirect(302, await getSignedPreviewUrl(document.storageKey));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const document = await prisma.eventDocument.findUnique({ where: { id: req.params.id } });
  if (!document || document.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Document not found.' });
  }
  if (document.storageKey) await deleteFile(document.storageKey);
  await prisma.eventDocument.delete({ where: { id: document.id } });
  res.json({ ok: true });
}));

export default router;
