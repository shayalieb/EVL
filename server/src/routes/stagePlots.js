import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { requireVertical } from '../lib/verticals.js';
import { uploadFile, getSignedDownloadUrl } from '../lib/fileStorage.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership), requireVertical('band_orchestra'));

function serializePlot(plot) {
  return {
    id: plot.id,
    eventId: plot.eventId,
    name: plot.name,
    pages: plot.pages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ id: p.id, order: p.order, name: p.name, scene: p.scene, hasThumbnail: !!p.thumbnailStorageKey })),
    channels: plot.channels.slice().sort((a, b) => a.channelNumber - b.channelNumber),
    backlineItems: plot.backlineItems.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
  };
}

// Get-or-create — an event's stage plot is provisioned lazily on first
// visit to the editor rather than at event-creation time, same idea as
// inquiryLinks.js's reusable-link. Always has at least one page.
router.get('/:eventId', asyncHandler(async (req, res) => {
  const { accountId } = req.membership;
  const { eventId } = req.params;

  let plot = await prisma.stagePlot.findUnique({
    where: { accountId_eventId: { accountId, eventId } },
    include: { pages: true, channels: true, backlineItems: true },
  });

  if (!plot) {
    plot = await prisma.stagePlot.create({
      data: {
        accountId,
        eventId,
        pages: { create: [{ order: 0, name: 'Page 1' }] },
      },
      include: { pages: true, channels: true, backlineItems: true },
    });
  }

  res.json({ stagePlot: serializePlot(plot) });
}));

async function loadOwnedPlot(accountId, eventId) {
  return prisma.stagePlot.findUnique({ where: { accountId_eventId: { accountId, eventId } }, include: { pages: true } });
}

// Autosave — debounced client-side (see StagePlotEditorPage.jsx), writes
// just this one page's scene, never the whole plot. thumbnailBase64 is a
// data-URL PNG (canvas.toDataURL()) re-uploaded through the same Supabase
// Storage path every other document type uses; optional so a save can skip
// re-uploading the image when only, say, a page rename happened.
router.patch('/:eventId/pages/:pageId', asyncHandler(async (req, res) => {
  const plot = await loadOwnedPlot(req.membership.accountId, req.params.eventId);
  if (!plot) return res.status(404).json({ error: 'Stage plot not found.' });
  const page = plot.pages.find((p) => p.id === req.params.pageId);
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

  const updated = await prisma.stagePlotPage.update({ where: { id: page.id }, data });
  res.json({ page: { id: updated.id, order: updated.order, name: updated.name, scene: updated.scene, hasThumbnail: !!updated.thumbnailStorageKey } });
}));

// Returns the signed URL as JSON rather than a redirect — a redirect would
// make the browser follow the Supabase leg with the SAME credentialed
// fetch() request that hit this route, and Supabase's signed-URL response
// carries a wildcard Access-Control-Allow-Origin, which browsers reject
// outright for a credentialed request (CORS forbids `*` + credentials
// together). Splitting into two hops lets the client fetch this route with
// credentials (it needs the session) and the Supabase URL without them (it
// doesn't — the signed token is itself the auth).
router.get('/:eventId/pages/:pageId/thumbnail', asyncHandler(async (req, res) => {
  const plot = await loadOwnedPlot(req.membership.accountId, req.params.eventId);
  const page = plot?.pages.find((p) => p.id === req.params.pageId);
  if (!page?.thumbnailStorageKey) return res.status(404).json({ error: 'No thumbnail yet.' });
  const url = await getSignedDownloadUrl(page.thumbnailStorageKey, `${page.name || 'page'}.png`);
  res.json({ url });
}));

router.post('/:eventId/pages', asyncHandler(async (req, res) => {
  const plot = await loadOwnedPlot(req.membership.accountId, req.params.eventId);
  if (!plot) return res.status(404).json({ error: 'Stage plot not found.' });
  const nextOrder = plot.pages.reduce((max, p) => Math.max(max, p.order), -1) + 1;
  const page = await prisma.stagePlotPage.create({
    data: { stagePlotId: plot.id, order: nextOrder, name: req.body?.name || `Page ${nextOrder + 1}` },
  });
  res.status(201).json({ page: { id: page.id, order: page.order, name: page.name, scene: page.scene, hasThumbnail: false } });
}));

// A stage plot always keeps at least one page — deleting the last one would
// leave the editor with nothing to show and no way back in through the UI.
//
// elementId on StagePlotChannel is a loose reference into this page's scene
// JSON (no foreign key — see the schema comment), so nothing at the DB
// level cleans it up. Without this, deleting a page leaves every channel
// linked to an icon on it permanently orphaned: a dead elementId that will
// never match anything again, sitting forever in the I/O list. Deleting
// (not unlinking) those channels here matches the "list mirrors what's
// actually on stage" behavior an icon's own delete already has.
router.delete('/:eventId/pages/:pageId', asyncHandler(async (req, res) => {
  const plot = await loadOwnedPlot(req.membership.accountId, req.params.eventId);
  if (!plot) return res.status(404).json({ error: 'Stage plot not found.' });
  if (plot.pages.length <= 1) return res.status(400).json({ error: 'A stage plot needs at least one page.' });
  const page = plot.pages.find((p) => p.id === req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Page not found.' });

  const elementIds = (page.scene?.elements || []).map((e) => e.id).filter(Boolean);
  let deletedChannelIds = [];
  if (elementIds.length) {
    const orphaned = await prisma.stagePlotChannel.findMany({
      where: { stagePlotId: plot.id, elementId: { in: elementIds } },
      select: { id: true },
    });
    deletedChannelIds = orphaned.map((c) => c.id);
    if (deletedChannelIds.length) {
      await prisma.stagePlotChannel.deleteMany({ where: { id: { in: deletedChannelIds } } });
    }
  }

  await prisma.stagePlotPage.delete({ where: { id: page.id } });
  res.json({ ok: true, deletedChannelIds });
}));

// Channel number is server-assigned (next available), not client-chosen —
// avoids the client needing to predict/resolve @@unique([stagePlotId,
// channelNumber]) conflicts itself.
router.post('/:eventId/channels', asyncHandler(async (req, res) => {
  const plot = await prisma.stagePlot.findUnique({
    where: { accountId_eventId: { accountId: req.membership.accountId, eventId: req.params.eventId } },
    include: { channels: true },
  });
  if (!plot) return res.status(404).json({ error: 'Stage plot not found.' });
  const { source, musicianName, phantomPower, powerNeeded, monitorNotes, elementId } = req.body || {};
  if (!source?.trim()) return res.status(400).json({ error: 'source is required.' });

  // "Next available" is read-then-write, not atomic — two requests close
  // enough together (e.g. duplicating several icons at once) can both read
  // the same max and collide on @@unique([stagePlotId, channelNumber]).
  // Retrying with a fresh max on that specific conflict is safe (channel
  // numbers have no meaning beyond "next"), and caps out fast since it only
  // ever re-fires on an actual collision, not on every request.
  const data = {
    stagePlotId: plot.id,
    source: source.trim(),
    musicianName: musicianName || null,
    phantomPower: !!phantomPower,
    powerNeeded: !!powerNeeded,
    monitorNotes: monitorNotes || null,
    elementId: elementId || null,
  };
  let channel;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await prisma.stagePlotChannel.findMany({ where: { stagePlotId: plot.id }, select: { channelNumber: true } });
    const nextChannelNumber = existing.reduce((max, c) => Math.max(max, c.channelNumber), 0) + 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      channel = await prisma.stagePlotChannel.create({ data: { ...data, channelNumber: nextChannelNumber } });
      break;
    } catch (err) {
      if (err.code !== 'P2002' || attempt === 4) throw err;
    }
  }
  res.status(201).json({ channel });
}));

// Drag-to-reorder from StagePlotChannelList.jsx — channelNumber IS the
// display order (there's no separate sort field), so reordering means
// renumbering every row 1..N in the new order. Done in two passes inside
// one transaction: first move every row to a negative, guaranteed-unused
// number, then assign the real 1..N — a single-pass renumber would
// transiently collide with @@unique([stagePlotId, channelNumber]) the
// moment two rows' old/new numbers cross.
router.post('/:eventId/channels/reorder', asyncHandler(async (req, res) => {
  const plot = await prisma.stagePlot.findUnique({
    where: { accountId_eventId: { accountId: req.membership.accountId, eventId: req.params.eventId } },
    include: { channels: true },
  });
  if (!plot) return res.status(404).json({ error: 'Stage plot not found.' });

  const { orderedIds } = req.body || {};
  const ownedIds = new Set(plot.channels.map((c) => c.id));
  if (!Array.isArray(orderedIds) || orderedIds.length !== plot.channels.length || !orderedIds.every((id) => ownedIds.has(id))) {
    return res.status(400).json({ error: 'orderedIds must list exactly this stage plot\'s channels, once each.' });
  }

  await prisma.$transaction([
    ...orderedIds.map((id, i) => prisma.stagePlotChannel.update({ where: { id }, data: { channelNumber: -(i + 1) } })),
    ...orderedIds.map((id, i) => prisma.stagePlotChannel.update({ where: { id }, data: { channelNumber: i + 1 } })),
  ]);

  const channels = await prisma.stagePlotChannel.findMany({ where: { stagePlotId: plot.id }, orderBy: { channelNumber: 'asc' } });
  res.json({ channels });
}));

async function loadOwnedChannel(accountId, eventId, channelId) {
  const channel = await prisma.stagePlotChannel.findUnique({ where: { id: channelId }, include: { stagePlot: true } });
  if (!channel || channel.stagePlot.accountId !== accountId || channel.stagePlot.eventId !== eventId) return null;
  return channel;
}

router.patch('/:eventId/channels/:channelId', asyncHandler(async (req, res) => {
  const channel = await loadOwnedChannel(req.membership.accountId, req.params.eventId, req.params.channelId);
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
    const updated = await prisma.stagePlotChannel.update({ where: { id: channel.id }, data });
    res.json({ channel: updated });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'That channel number is already in use.' });
    throw err;
  }
}));

router.delete('/:eventId/channels/:channelId', asyncHandler(async (req, res) => {
  const channel = await loadOwnedChannel(req.membership.accountId, req.params.eventId, req.params.channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found.' });
  await prisma.stagePlotChannel.delete({ where: { id: channel.id } });
  res.json({ ok: true });
}));

// No server-assigned numbering like channels above — backline items don't
// map to a numbered input, so there's no @@unique to retry against.
router.post('/:eventId/backline-items', asyncHandler(async (req, res) => {
  const plot = await loadOwnedPlot(req.membership.accountId, req.params.eventId);
  if (!plot) return res.status(404).json({ error: 'Stage plot not found.' });
  const { item, quantity, providedBy, notesHtml } = req.body || {};
  if (!item?.trim()) return res.status(400).json({ error: 'item is required.' });

  const created = await prisma.stagePlotBacklineItem.create({
    data: {
      stagePlotId: plot.id,
      item: item.trim(),
      quantity: Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Math.trunc(Number(quantity)) : 1,
      providedBy: providedBy || null,
      notesHtml: notesHtml || null,
    },
  });
  res.status(201).json({ item: created });
}));

async function loadOwnedBacklineItem(accountId, eventId, itemId) {
  const item = await prisma.stagePlotBacklineItem.findUnique({ where: { id: itemId }, include: { stagePlot: true } });
  if (!item || item.stagePlot.accountId !== accountId || item.stagePlot.eventId !== eventId) return null;
  return item;
}

router.patch('/:eventId/backline-items/:itemId', asyncHandler(async (req, res) => {
  const item = await loadOwnedBacklineItem(req.membership.accountId, req.params.eventId, req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Backline item not found.' });

  const { item: name, quantity, providedBy, notesHtml } = req.body || {};
  const data = {};
  if (name !== undefined) data.item = name;
  if (quantity !== undefined) data.quantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Math.trunc(Number(quantity)) : 1;
  if (providedBy !== undefined) data.providedBy = providedBy || null;
  if (notesHtml !== undefined) data.notesHtml = notesHtml || null;

  const updated = await prisma.stagePlotBacklineItem.update({ where: { id: item.id }, data });
  res.json({ item: updated });
}));

router.delete('/:eventId/backline-items/:itemId', asyncHandler(async (req, res) => {
  const item = await loadOwnedBacklineItem(req.membership.accountId, req.params.eventId, req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Backline item not found.' });
  await prisma.stagePlotBacklineItem.delete({ where: { id: item.id } });
  res.json({ ok: true });
}));

export default router;
