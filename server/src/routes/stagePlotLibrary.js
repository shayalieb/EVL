import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { requireVertical } from '../lib/verticals.js';
import { uploadFile, getSignedDownloadUrl } from '../lib/fileStorage.js';
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

// Same field names/shapes as stagePlots.js's serializePlot() — the editor
// components (StagePlotPageEditor/ChannelList/BacklineList) are shared with
// the event-scoped editor and expect this exact shape, not a library-
// specific one.
function serializeDetail(item) {
  return {
    id: item.id,
    name: item.name,
    pages: item.pages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ id: p.id, order: p.order, name: p.name, scene: p.scene, hasThumbnail: !!p.thumbnailStorageKey })),
    channels: item.channels.slice().sort((a, b) => a.channelNumber - b.channelNumber),
    backlineItems: item.backlineItems.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
  };
}

async function loadOwnedItem(accountId, id) {
  const item = await prisma.stagePlotLibraryItem.findUnique({ where: { id }, include: { pages: true, channels: true, backlineItems: true } });
  if (!item || item.accountId !== accountId) return null;
  return item;
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

// "+ Add Stage Plot" — a blank template built directly in the library, with
// no event behind it at all. Same lazy-create shape stagePlots.js's
// getOrCreatePlot uses for a brand-new event's plot (one page, "Page 1").
router.post('/', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const name = req.body?.name?.trim();
  const item = await prisma.stagePlotLibraryItem.create({
    data: {
      accountId: req.membership.accountId,
      ...(name ? { name } : {}),
      pages: { create: [{ order: 0, name: 'Page 1' }] },
    },
    include: { pages: true, channels: true, backlineItems: true },
  });
  res.status(201).json({ stagePlot: serializeSummary(item) });
}));

// Full detail for the library editor page (StagePlotLibraryEditorPage.jsx)
// to load — the list above intentionally omits scene JSON to stay light.
router.get('/:id', asyncHandler(async (req, res) => {
  const item = await loadOwnedItem(req.membership.accountId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Saved stage plot not found.' });
  res.json({ stagePlot: serializeDetail(item) });
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

// Autosave — mirrors stagePlots.js's PATCH /:eventId/pages/:pageId exactly,
// scoped by libraryItemId instead of eventId.
router.patch('/:id/pages/:pageId', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const item = await loadOwnedItem(req.membership.accountId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Saved stage plot not found.' });
  const page = item.pages.find((p) => p.id === req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Page not found.' });

  const { scene, name, thumbnailBase64 } = req.body || {};
  const data = {};
  if (scene !== undefined) data.scene = scene;
  if (name !== undefined) data.name = name;
  if (thumbnailBase64) {
    const buffer = Buffer.from(thumbnailBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
    data.thumbnailStorageKey = await uploadFile({ accountId: req.membership.accountId, buffer, contentType: 'image/png' });
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  const updated = await prisma.stagePlotLibraryPage.update({ where: { id: page.id }, data });
  res.json({ page: { id: updated.id, order: updated.order, name: updated.name, scene: updated.scene, hasThumbnail: !!updated.thumbnailStorageKey } });
}));

router.post('/:id/pages', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const item = await loadOwnedItem(req.membership.accountId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Saved stage plot not found.' });
  const nextOrder = item.pages.reduce((max, p) => Math.max(max, p.order), -1) + 1;
  const page = await prisma.stagePlotLibraryPage.create({
    data: { libraryItemId: item.id, order: nextOrder, name: req.body?.name || `Page ${nextOrder + 1}` },
  });
  res.status(201).json({ page: { id: page.id, order: page.order, name: page.name, scene: page.scene, hasThumbnail: false } });
}));

// Same "always keep at least one page" + orphaned-channel cleanup as
// stagePlots.js's DELETE /:eventId/pages/:pageId.
router.delete('/:id/pages/:pageId', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const item = await loadOwnedItem(req.membership.accountId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Saved stage plot not found.' });
  if (item.pages.length <= 1) return res.status(400).json({ error: 'A stage plot needs at least one page.' });
  const page = item.pages.find((p) => p.id === req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Page not found.' });

  const elementIds = (page.scene?.elements || []).map((e) => e.id).filter(Boolean);
  let deletedChannelIds = [];
  if (elementIds.length) {
    const orphaned = await prisma.stagePlotLibraryChannel.findMany({
      where: { libraryItemId: item.id, elementId: { in: elementIds } },
      select: { id: true },
    });
    deletedChannelIds = orphaned.map((c) => c.id);
    if (deletedChannelIds.length) {
      await prisma.stagePlotLibraryChannel.deleteMany({ where: { id: { in: deletedChannelIds } } });
    }
  }

  await prisma.stagePlotLibraryPage.delete({ where: { id: page.id } });
  res.json({ ok: true, deletedChannelIds });
}));

// Server-assigned channelNumber with the same read-then-write retry as
// stagePlots.js's POST /:eventId/channels.
router.post('/:id/channels', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const item = await loadOwnedItem(req.membership.accountId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Saved stage plot not found.' });
  const { source, musicianName, phantomPower, powerNeeded, monitorNotes, elementId } = req.body || {};
  if (!source?.trim()) return res.status(400).json({ error: 'source is required.' });

  const data = {
    libraryItemId: item.id,
    source: source.trim(),
    musicianName: musicianName || null,
    phantomPower: !!phantomPower,
    powerNeeded: !!powerNeeded,
    monitorNotes: monitorNotes || null,
    elementId: elementId || null,
  };
  let channel;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await prisma.stagePlotLibraryChannel.findMany({ where: { libraryItemId: item.id }, select: { channelNumber: true } });
    const nextChannelNumber = existing.reduce((max, c) => Math.max(max, c.channelNumber), 0) + 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      channel = await prisma.stagePlotLibraryChannel.create({ data: { ...data, channelNumber: nextChannelNumber } });
      break;
    } catch (err) {
      if (err.code !== 'P2002' || attempt === 4) throw err;
    }
  }
  res.status(201).json({ channel });
}));

router.post('/:id/channels/reorder', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const item = await loadOwnedItem(req.membership.accountId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Saved stage plot not found.' });

  const { orderedIds } = req.body || {};
  const ownedIds = new Set(item.channels.map((c) => c.id));
  if (!Array.isArray(orderedIds) || orderedIds.length !== item.channels.length || !orderedIds.every((id) => ownedIds.has(id))) {
    return res.status(400).json({ error: 'orderedIds must list exactly this stage plot\'s channels, once each.' });
  }

  await prisma.$transaction([
    ...orderedIds.map((id, i) => prisma.stagePlotLibraryChannel.update({ where: { id }, data: { channelNumber: -(i + 1) } })),
    ...orderedIds.map((id, i) => prisma.stagePlotLibraryChannel.update({ where: { id }, data: { channelNumber: i + 1 } })),
  ]);

  const channels = await prisma.stagePlotLibraryChannel.findMany({ where: { libraryItemId: item.id }, orderBy: { channelNumber: 'asc' } });
  res.json({ channels });
}));

async function loadOwnedChannel(accountId, libraryItemId, channelId) {
  const channel = await prisma.stagePlotLibraryChannel.findUnique({ where: { id: channelId }, include: { libraryItem: true } });
  if (!channel || channel.libraryItem.accountId !== accountId || channel.libraryItem.id !== libraryItemId) return null;
  return channel;
}

router.patch('/:id/channels/:channelId', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const channel = await loadOwnedChannel(req.membership.accountId, req.params.id, req.params.channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found.' });

  const { channelNumber, source, musicianName, phantomPower, powerNeeded, monitorNotes, elementId } = req.body || {};
  const data = {};
  if (channelNumber !== undefined) data.channelNumber = channelNumber;
  if (source !== undefined) data.source = source;
  if (musicianName !== undefined) data.musicianName = musicianName || null;
  if (phantomPower !== undefined) data.phantomPower = !!phantomPower;
  if (powerNeeded !== undefined) data.powerNeeded = !!powerNeeded;
  if (monitorNotes !== undefined) data.monitorNotes = monitorNotes || null;
  if (elementId !== undefined) data.elementId = elementId || null;

  try {
    const updated = await prisma.stagePlotLibraryChannel.update({ where: { id: channel.id }, data });
    res.json({ channel: updated });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'That channel number is already in use.' });
    throw err;
  }
}));

router.delete('/:id/channels/:channelId', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const channel = await loadOwnedChannel(req.membership.accountId, req.params.id, req.params.channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found.' });
  await prisma.stagePlotLibraryChannel.delete({ where: { id: channel.id } });
  res.json({ ok: true });
}));

router.post('/:id/backline-items', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const item = await loadOwnedItem(req.membership.accountId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Saved stage plot not found.' });
  const { item: name, quantity, providedBy, notesHtml } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'item is required.' });

  const created = await prisma.stagePlotLibraryBacklineItem.create({
    data: {
      libraryItemId: item.id,
      item: name.trim(),
      quantity: Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Math.trunc(Number(quantity)) : 1,
      providedBy: providedBy || null,
      notesHtml: notesHtml || null,
    },
  });
  res.status(201).json({ item: created });
}));

async function loadOwnedBacklineItem(accountId, libraryItemId, itemId) {
  const item = await prisma.stagePlotLibraryBacklineItem.findUnique({ where: { id: itemId }, include: { libraryItem: true } });
  if (!item || item.libraryItem.accountId !== accountId || item.libraryItem.id !== libraryItemId) return null;
  return item;
}

router.patch('/:id/backline-items/:itemId', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const item = await loadOwnedBacklineItem(req.membership.accountId, req.params.id, req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Backline item not found.' });

  const { item: name, quantity, providedBy, notesHtml } = req.body || {};
  const data = {};
  if (name !== undefined) data.item = name;
  if (quantity !== undefined) data.quantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Math.trunc(Number(quantity)) : 1;
  if (providedBy !== undefined) data.providedBy = providedBy || null;
  if (notesHtml !== undefined) data.notesHtml = notesHtml || null;

  const updated = await prisma.stagePlotLibraryBacklineItem.update({ where: { id: item.id }, data });
  res.json({ item: updated });
}));

router.delete('/:id/backline-items/:itemId', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const item = await loadOwnedBacklineItem(req.membership.accountId, req.params.id, req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Backline item not found.' });
  await prisma.stagePlotLibraryBacklineItem.delete({ where: { id: item.id } });
  res.json({ ok: true });
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
