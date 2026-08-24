import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { createSignedUpload, uploadedFileSize, getSignedDownloadUrl, deleteFile } from '../lib/fileStorage.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const CATEGORIES = ['proposal', 'contract'];

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

router.get('/', asyncHandler(async (req, res) => {
  const { bookingId, category } = req.query;
  if (!bookingId) return res.status(400).json({ error: 'bookingId is required.' });
  if (category && !CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category.' });

  const documents = await prisma.bookingDocument.findMany({
    where: { accountId: req.membership.accountId, bookingId, ...(category ? { category } : {}) },
    select: { id: true, category: true, filename: true, contentType: true, size: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ documents });
}));

router.post('/upload-url', asyncHandler(async (req, res) => {
  const { filename, size } = req.body || {};
  if (!filename?.trim() || !Number.isInteger(size) || size <= 0) {
    return res.status(400).json({ error: 'A valid filename and size are required.' });
  }
  if (size > MAX_FILE_SIZE) return res.status(413).json({ error: 'File is too large (10MB max).' });
  res.json(await createSignedUpload({ accountId: req.membership.accountId }));
}));

router.post('/upload-complete', asyncHandler(async (req, res) => {
  const { storageKey, bookingId, category, filename, contentType, size } = req.body || {};
  if (!storageKey?.startsWith(`${req.membership.accountId}/`) || !bookingId?.trim() || !CATEGORIES.includes(category) || !filename?.trim() || !Number.isInteger(size) || size <= 0) {
    return res.status(400).json({ error: 'Invalid upload metadata.' });
  }
  if (size > MAX_FILE_SIZE) return res.status(413).json({ error: 'File is too large (10MB max).' });
  const actualSize = await uploadedFileSize(storageKey);
  if (actualSize === null) return res.status(409).json({ error: 'Upload has not completed.' });
  if (actualSize > MAX_FILE_SIZE || (actualSize && actualSize !== size)) {
    await deleteFile(storageKey);
    return res.status(400).json({ error: 'Uploaded file size does not match.' });
  }
  const existing = await prisma.bookingDocument.findFirst({ where: { accountId: req.membership.accountId, storageKey } });
  if (existing) return res.status(409).json({ error: 'Upload was already completed.' });
  const document = await prisma.bookingDocument.create({
    data: { accountId: req.membership.accountId, bookingId: bookingId.trim(), category, filename: filename.trim(), contentType: contentType || 'application/octet-stream', size, storageKey },
    select: { id: true, category: true, filename: true, contentType: true, size: true, createdAt: true },
  });
  res.status(201).json({ document });
}));

// storageKey is the new (post-migration) path — signed-URL redirect, so the
// bytes never round-trip through this process. Rows uploaded before the
// storage migration only have `data`, so those still get served directly.
router.get('/:id/download', asyncHandler(async (req, res) => {
  const document = await prisma.bookingDocument.findUnique({ where: { id: req.params.id } });
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

router.delete('/:id', asyncHandler(async (req, res) => {
  const document = await prisma.bookingDocument.findUnique({ where: { id: req.params.id } });
  if (!document || document.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Document not found.' });
  }
  if (document.storageKey) await deleteFile(document.storageKey);
  await prisma.bookingDocument.delete({ where: { id: document.id } });
  res.json({ ok: true });
}));

export default router;
