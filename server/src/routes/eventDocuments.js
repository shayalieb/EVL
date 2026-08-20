import { Router } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { uploadFile, getSignedDownloadUrl, getSignedPreviewUrl, deleteFile, copyFile } from '../lib/fileStorage.js';
import { generateToken } from '../lib/resetToken.js';
import { requireCsrfHeader } from '../lib/csrf.js';

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

router.post('/', requireCsrfHeader, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File is too large (10MB max).' });
    }
    if (err) return next(err);
    next();
  });
}, asyncHandler(async (req, res) => {
  // eventId is omitted for account-level attachments not tied to any event
  // (e.g. a Set List library song) — see schema.prisma's EventDocument.eventId.
  const eventId = req.body?.eventId?.trim() || null;
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
      // Every document gets one, not just Set List songs — cheap, and keeps
      // this route from needing to know why it's being uploaded. Only Set
      // List songs ever surface it in a UI (see schema.prisma's
      // EventDocument.shareToken doc comment).
      shareToken: generateToken(),
    },
    select: { id: true, filename: true, contentType: true, size: true, createdAt: true, shareToken: true },
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

// Duplicates a document's underlying storage bytes plus a new DB row, for
// a target eventId (or account-level again if omitted) — the copy is a
// fully independent document from the moment it's created, so deleting
// either the source or the copy never affects the other. See
// SetListsEditorPage.jsx's pullFromLibrary, the only current caller.
router.post('/:id/copy', asyncHandler(async (req, res) => {
  const source = await prisma.eventDocument.findUnique({ where: { id: req.params.id } });
  if (!source || source.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Document not found.' });
  }
  if (!source.storageKey) return res.status(400).json({ error: 'This document predates copyable storage and cannot be duplicated.' });
  const eventId = req.body?.eventId?.trim() || null;
  const storageKey = await copyFile(source.storageKey, req.membership.accountId);
  const document = await prisma.eventDocument.create({
    data: {
      accountId: req.membership.accountId,
      eventId,
      filename: source.filename,
      contentType: source.contentType,
      size: source.size,
      storageKey,
      // A fresh token, not the source's — the copy is a fully independent
      // document (see the doc comment above), so its public link shouldn't
      // ride on the original's lifecycle either.
      shareToken: generateToken(),
    },
    select: { id: true, filename: true, contentType: true, size: true, createdAt: true, shareToken: true },
  });
  res.status(201).json({ document });
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

// Public (unauthenticated, token-based) — mounted separately in index.js,
// same separation as publicRsvpRouter/publicContractorCalendarRouter. Lets a
// Set List song's PDF be downloaded by a band member from an emailed link
// without an app login, the same way it already rides along as a real email
// attachment (see lib/setList.js) — this just makes that same file openable
// on its own too. shareToken (not `id`) is the lookup key, so a leaked
// document `id` alone (used elsewhere as an authenticated lookup key) can't
// be turned into a public download.
export const publicSongSheetsRouter = Router();

const songSheetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
});

publicSongSheetsRouter.get('/:token/download', songSheetLimiter, asyncHandler(async (req, res) => {
  const document = await prisma.eventDocument.findUnique({ where: { shareToken: req.params.token } });
  if (!document) return res.status(404).json({ error: 'This link is invalid.' });
  if (document.storageKey) {
    return res.redirect(302, await getSignedDownloadUrl(document.storageKey, document.filename));
  }
  res.setHeader('Content-Type', document.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${document.filename.replace(/"/g, '')}"`);
  res.send(document.data);
}));

export default router;
