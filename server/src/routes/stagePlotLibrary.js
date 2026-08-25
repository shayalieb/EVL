import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { requireVertical } from '../lib/verticals.js';
import { getSignedDownloadUrl } from '../lib/fileStorage.js';
import { getOrCreatePlot } from './stagePlots.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership), requireVertical('band_orchestra'));

function canManage(req) {
  return effectivePermissions(req.membership).manageEvents;
}

function serializeSummary(item) {
  return {
    id: item.id,
    name: item.name,
    pageCount: item.pages.length,
    channelCount: item.channels.length,
    backlineCount: item.backlineItems.length,
    hasThumbnail: item.pages.some((p) => p.thumbnailStorageKey),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const items = await prisma.stagePlotLibraryItem.findMany({
    where: {
      accountId: req.membership.accountId,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    include: { pages: { select: { thumbnailStorageKey: true } }, channels: { select: { id: true } }, backlineItems: { select: { id: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ stagePlotLibrary: items.map(serializeSummary) });
}));

// First page's thumbnail — same two-hop signed-URL pattern as stagePlots.js
// (a redirect here would make the browser follow Supabase's leg with the
// same credentialed request that hit this route, which its wildcard CORS
// header rejects).
router.get('/:id/thumbnail', asyncHandler(async (req, res) => {
  const item = await prisma.stagePlotLibraryItem.findUnique({ where: { id: req.params.id }, include: { pages: true } });
  if (!item || item.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Saved stage plot not found.' });
  const page = item.pages.slice().sort((a, b) => a.order - b.order).find((p) => p.thumbnailStorageKey);
  if (!page) return res.status(404).json({ error: 'No thumbnail yet.' });
  const url = await getSignedDownloadUrl(page.thumbnailStorageKey, `${item.name || 'stage-plot'}.png`);
  res.json({ url });
}));

// "Save to Library" — snapshots an event's current stage plot (pages,
// channels, backline) into a brand-new, account-scoped library item. IDs
// inside each page's scene JSON are copied verbatim, not regenerated — this
// copy is inert until it's applied to some event (see stagePlots.js's
// apply-library route, which does the regeneration at that point), so
// there's no collision risk to guard against yet.
router.post('/from-event/:eventId', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'name is required.' });

  const plot = await getOrCreatePlot(req.membership.accountId, req.params.eventId);

  const item = await prisma.stagePlotLibraryItem.create({
    data: {
      accountId: req.membership.accountId,
      name,
      pages: {
        create: plot.pages
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((p) => ({ order: p.order, name: p.name, scene: p.scene, thumbnailStorageKey: p.thumbnailStorageKey })),
      },
      channels: {
        create: plot.channels.map((c) => ({
          channelNumber: c.channelNumber,
          source: c.source,
          musicianName: c.musicianName,
          phantomPower: c.phantomPower,
          powerNeeded: c.powerNeeded,
          monitorNotes: c.monitorNotes,
          elementId: c.elementId,
        })),
      },
      backlineItems: {
        create: plot.backlineItems.map((b) => ({ item: b.item, quantity: b.quantity, providedBy: b.providedBy, notesHtml: b.notesHtml })),
      },
    },
    include: { pages: true, channels: true, backlineItems: true },
  });

  res.status(201).json({ stagePlot: serializeSummary(item) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.stagePlotLibraryItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Saved stage plot not found.' });
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const item = await prisma.stagePlotLibraryItem.update({
    where: { id: existing.id },
    data: { name },
    include: { pages: true, channels: true, backlineItems: true },
  });
  res.json({ stagePlot: serializeSummary(item) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.stagePlotLibraryItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Saved stage plot not found.' });
  await prisma.stagePlotLibraryItem.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
