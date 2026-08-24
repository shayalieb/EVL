import { Router } from 'express';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { createSignedUpload, uploadedFileSize, getSignedDownloadUrl, getSignedPreviewUrl, deleteFile, copyFile } from '../lib/fileStorage.js';
import { hashToken, generateToken } from '../lib/resetToken.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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

router.post('/upload-url', asyncHandler(async (req, res) => {
  const { filename, size } = req.body || {};
  if (!filename?.trim() || !Number.isInteger(size) || size <= 0) {
    return res.status(400).json({ error: 'A valid filename and size are required.' });
  }
  if (size > MAX_FILE_SIZE) return res.status(413).json({ error: 'File is too large (10MB max).' });
  res.json(await createSignedUpload({ accountId: req.membership.accountId }));
}));

router.post('/upload-complete', asyncHandler(async (req, res) => {
  const { storageKey, eventId, filename, contentType, size } = req.body || {};
  if (!storageKey?.startsWith(`${req.membership.accountId}/`) || !filename?.trim() || !Number.isInteger(size) || size <= 0) {
    return res.status(400).json({ error: 'Invalid upload metadata.' });
  }
  if (size > MAX_FILE_SIZE) return res.status(413).json({ error: 'File is too large (10MB max).' });
  const actualSize = await uploadedFileSize(storageKey);
  if (actualSize === null) return res.status(409).json({ error: 'Upload has not completed.' });
  if (actualSize > MAX_FILE_SIZE || (actualSize && actualSize !== size)) {
    await deleteFile(storageKey);
    return res.status(400).json({ error: 'Uploaded file size does not match.' });
  }
  const existing = await prisma.eventDocument.findFirst({ where: { accountId: req.membership.accountId, storageKey } });
  if (existing) return res.status(409).json({ error: 'Upload was already completed.' });
  const shareToken = generateToken();
  const document = await prisma.eventDocument.create({
    data: { accountId: req.membership.accountId, eventId: eventId?.trim() || null, filename: filename.trim(), contentType: contentType || 'application/octet-stream', size, storageKey, shareToken, shareTokenHash: hashToken(shareToken) },
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
  const copyShareToken = generateToken();
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
      shareToken: copyShareToken,
      shareTokenHash: hashToken(copyShareToken),
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

const songSheetLimiter = createRateLimiter('public-song-sheet', {
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: { error: 'Too many requests. Please try again shortly.' },
});

publicSongSheetsRouter.get('/:token/download', songSheetLimiter, asyncHandler(async (req, res) => {
  const document = await prisma.eventDocument.findUnique({ where: { shareTokenHash: hashToken(req.params.token) } });
  if (!document) return res.status(404).json({ error: 'This link is invalid.' });
  if (document.storageKey) {
    return res.redirect(302, await getSignedDownloadUrl(document.storageKey, document.filename));
  }
  res.setHeader('Content-Type', document.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${document.filename.replace(/"/g, '')}"`);
  res.send(document.data);
}));

export default router;
