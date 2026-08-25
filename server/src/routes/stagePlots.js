import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { requireVertical } from '../lib/verticals.js';
import { uploadFile, getSignedDownloadUrl } from '../lib/fileStorage.js';
import { withSerializableTransaction } from '../lib/serializableTransaction.js';
import { decodeStagePlotThumbnail, deleteStagePlotThumbnailIfUnused } from '../lib/stagePlotThumbnails.js';

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
      .map((p) => ({ id: p.id, order: p.order, name: p.name, scene: p.scene, hasThumbnail: !!p.thumbnailStorageKey, updatedAt: p.updatedAt })),
    channels: plot.channels.slice().sort((a, b) => a.channelNumber - b.channelNumber),
    backlineItems: plot.backlineItems.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
  };
}

// Get-or-create — an event's stage plot is provisioned lazily on first
// visit to the editor rather than at event-creation time, same idea as
// inquiryLinks.js's reusable-link. Always has at least one page. Exported
// for stagePlotLibrary.js's "Save to Library" route, which needs the same
// lazy-create behavior to snapshot whatever the event's plot currently is.
export async function getOrCreatePlot(accountId, eventId, database = prisma) {
  const event = await database.event.findFirst({ where: { id: eventId, accountId, deletedAt: null }, select: { id: true } });
  if (!event) return null;
  return database.stagePlot.upsert({
    where: { accountId_eventId: { accountId, eventId } },
    update: {},
    create: { accountId, eventId, pages: { create: [{ order: 0, name: 'Page 1' }] } },
    include: { pages: true, channels: true, backlineItems: true },
  });
}

router.get('/:eventId', asyncHandler(async (req, res) => {
  const plot = await getOrCreatePlot(req.membership.accountId, req.params.eventId);
  if (!plot) return res.status(404).json({ error: 'Event not found.' });
  res.json({ stagePlot: serializePlot(plot) });
}));

async function loadOwnedPlot(accountId, eventId) {
  return prisma.stagePlot.findUnique({ where: { accountId_eventId: { accountId, eventId } }, include: { pages: true } });
}

// Regenerates every id in a page's scene graph (see sceneModel.js's header
// comment for the shape) and rewrites the layerId references that point at
// them, so a cloned page can never collide with ids already present
// elsewhere in the target stage plot. Returns the elementId remap too, since
// StagePlotChannel.elementId is a loose pointer into a page's elements that
// has to follow the clone. Deliberately reimplemented here rather than
// imported from src/lib/canvasEngine/sceneModel.js — that module is
// browser-only canvas-authoring code; this just needs to walk known JSON.
let remapCounter = 0;
function remapId(prefix) {
  remapCounter += 1;
  return `${prefix}_clone_${Date.now().toString(36)}_${remapCounter}`;
}
function remapSceneIds(scene) {
  const layerIdMap = new Map((scene?.layers || []).map((l) => [l.id, remapId('layer')]));
  const elementIdMap = new Map();
  const remapped = {
    ...scene,
    layers: (scene?.layers || []).map((l) => ({ ...l, id: layerIdMap.get(l.id) })),
    elements: (scene?.elements || []).map((e) => {
      const newId = remapId('el');
      elementIdMap.set(e.id, newId);
      return { ...e, id: newId, layerId: layerIdMap.get(e.layerId) || e.layerId };
    }),
    strokes: (scene?.strokes || []).map((s) => ({ ...s, id: remapId('stroke'), layerId: layerIdMap.get(s.layerId) || s.layerId })),
    annotations: (scene?.annotations || []).map((a) => ({ ...a, id: remapId('note'), layerId: layerIdMap.get(a.layerId) || a.layerId })),
  };
  return { scene: remapped, elementIdMap };
}

// "Add from Library" — deep-clones a saved StagePlotLibraryItem's
// pages/channels/backline into this event's own stage plot as brand-new
// rows. Always appends (new page tabs, channel numbers continuing on from
// whatever's already there) rather than replacing, so it never destroys
// work already on the event's plot. Every id is freshly generated (pages,
// channels, backline rows, and every id inside each page's scene JSON), so
// the copy is fully independent from this point on — same guarantee Set
// List Library's "pull from library" gives, just done server-side because
// this data is normalized across several tables instead of one JSON blob.
router.post('/:eventId/apply-library/:libraryItemId', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { accountId } = req.membership;
  const { eventId, libraryItemId } = req.params;

  const mode = req.body?.mode === 'replace' ? 'replace' : 'append';
  const include = {
    pages: req.body?.include?.pages !== false,
    channels: req.body?.include?.channels !== false,
    backlineItems: req.body?.include?.backlineItems !== false,
  };
  if (!include.pages && !include.channels && !include.backlineItems) {
    return res.status(400).json({ error: 'Choose at least one stage plot section to add.' });
  }

  const result = await withSerializableTransaction(prisma, async (tx) => {
    const libraryItem = await tx.stagePlotLibraryItem.findUnique({
      where: { id: libraryItemId },
      include: { pages: true, channels: true, backlineItems: true },
    });
    if (!libraryItem || libraryItem.accountId !== accountId) return { error: 'library' };
    const plot = await getOrCreatePlot(accountId, eventId, tx);
    if (!plot) return { error: 'event' };
    if (mode === 'replace') {
      if (include.channels) await tx.stagePlotChannel.deleteMany({ where: { stagePlotId: plot.id } });
      if (include.backlineItems) await tx.stagePlotBacklineItem.deleteMany({ where: { stagePlotId: plot.id } });
      if (include.pages) await tx.stagePlotPage.deleteMany({ where: { stagePlotId: plot.id } });
    }
    let nextOrder = mode === 'replace' && include.pages ? 0 : plot.pages.reduce((max, p) => Math.max(max, p.order), -1) + 1;
    let nextChannelNumber = mode === 'replace' && include.channels ? 1 : plot.channels.reduce((max, c) => Math.max(max, c.channelNumber), 0) + 1;
    const elementIdMap = new Map();
    const pageCreates = (include.pages ? libraryItem.pages : [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((page) => {
      const { scene, elementIdMap: pageElementIdMap } = remapSceneIds(page.scene);
      pageElementIdMap.forEach((newId, oldId) => elementIdMap.set(oldId, newId));
      return {
        stagePlotId: plot.id,
        order: nextOrder++,
        name: page.name,
        scene,
        thumbnailStorageKey: page.thumbnailStorageKey,
      };
    });

    const channelCreates = (include.channels ? libraryItem.channels : []).map((channel) => ({
    stagePlotId: plot.id,
    channelNumber: nextChannelNumber++,
    source: channel.source,
    musicianName: channel.musicianName,
    phantomPower: channel.phantomPower,
    powerNeeded: channel.powerNeeded,
    monitorNotes: channel.monitorNotes,
    elementId: elementIdMap.get(channel.elementId) || null,
  }));

    const backlineCreates = (include.backlineItems ? libraryItem.backlineItems : []).map((item) => ({
    stagePlotId: plot.id,
    item: item.item,
    quantity: item.quantity,
    providedBy: item.providedBy,
    notesHtml: item.notesHtml,
  }));

    await Promise.all([
      ...pageCreates.map((data) => tx.stagePlotPage.create({ data })),
      ...channelCreates.map((data) => tx.stagePlotChannel.create({ data })),
      ...backlineCreates.map((data) => tx.stagePlotBacklineItem.create({ data })),
    ]);
    return { plotId: plot.id };
  });
  if (result.error === 'library') return res.status(404).json({ error: 'Saved stage plot not found.' });
  if (result.error === 'event') return res.status(404).json({ error: 'Event not found.' });

  const merged = await prisma.stagePlot.findUnique({
    where: { id: result.plotId },
    include: { pages: true, channels: true, backlineItems: true },
  });
  res.json({ stagePlot: serializePlot(merged) });
}));

// Autosave — debounced client-side (see StagePlotEditorPage.jsx), writes
// just this one page's scene, never the whole plot. thumbnailBase64 is a
// data-URL PNG (canvas.toDataURL()) re-uploaded through the same Supabase
// Storage path every other document type uses; optional so a save can skip
// re-uploading the image when only, say, a page rename happened.
router.patch('/:eventId/pages/:pageId', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const plot = await loadOwnedPlot(req.membership.accountId, req.params.eventId);
  if (!plot) return res.status(404).json({ error: 'Stage plot not found.' });
  const page = plot.pages.find((p) => p.id === req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Page not found.' });

  const { scene, name, thumbnailBase64, expectedUpdatedAt } = req.body || {};
  const data = {};
  if (scene !== undefined) data.scene = scene;
  if (name !== undefined) data.name = name;
  if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== page.updatedAt.getTime()) {
    return res.status(409).json({ error: 'This stage plot page was updated in another session. Reload before saving again.', code: 'STALE_STAGE_PLOT_PAGE' });
  }
  if (thumbnailBase64) {
    const buffer = decodeStagePlotThumbnail(thumbnailBase64);
    data.thumbnailStorageKey = await uploadFile({ accountId: req.membership.accountId, buffer, contentType: 'image/png' });
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  const write = expectedUpdatedAt
    ? await prisma.stagePlotPage.updateMany({ where: { id: page.id, updatedAt: new Date(expectedUpdatedAt) }, data })
    : { count: 1 };
  if (write.count === 0) {
    await deleteStagePlotThumbnailIfUnused(data.thumbnailStorageKey);
    return res.status(409).json({ error: 'This stage plot page was updated in another session. Reload before saving again.', code: 'STALE_STAGE_PLOT_PAGE' });
  }
  const updated = expectedUpdatedAt
    ? await prisma.stagePlotPage.findUnique({ where: { id: page.id } })
    : await prisma.stagePlotPage.update({ where: { id: page.id }, data });
  if (page.thumbnailStorageKey && page.thumbnailStorageKey !== updated.thumbnailStorageKey) {
    await deleteStagePlotThumbnailIfUnused(page.thumbnailStorageKey);
  }
  res.json({ page: { id: updated.id, order: updated.order, name: updated.name, scene: updated.scene, hasThumbnail: !!updated.thumbnailStorageKey, updatedAt: updated.updatedAt } });
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
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const plot = await loadOwnedPlot(req.membership.accountId, req.params.eventId);
  if (!plot) return res.status(404).json({ error: 'Stage plot not found.' });
  let page;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pages = await prisma.stagePlotPage.findMany({ where: { stagePlotId: plot.id }, select: { order: true } });
    const nextOrder = pages.reduce((max, candidate) => Math.max(max, candidate.order), -1) + 1;
    try {
      page = await prisma.stagePlotPage.create({ data: { stagePlotId: plot.id, order: nextOrder, name: req.body?.name || `Page ${nextOrder + 1}` } });
      break;
    } catch (err) {
      if (err.code !== 'P2002' || attempt === 4) throw err;
    }
  }
  res.status(201).json({ page: { id: page.id, order: page.order, name: page.name, scene: page.scene, hasThumbnail: false, updatedAt: page.updatedAt } });
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
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
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
  await deleteStagePlotThumbnailIfUnused(page.thumbnailStorageKey);
  res.json({ ok: true, deletedChannelIds });
}));

// Channel number is server-assigned (next available), not client-chosen —
// avoids the client needing to predict/resolve @@unique([stagePlotId,
// channelNumber]) conflicts itself.
router.post('/:eventId/channels', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
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
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
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
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
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
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const channel = await loadOwnedChannel(req.membership.accountId, req.params.eventId, req.params.channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found.' });
  await prisma.stagePlotChannel.delete({ where: { id: channel.id } });
  res.json({ ok: true });
}));

// No server-assigned numbering like channels above — backline items don't
// map to a numbered input, so there's no @@unique to retry against.
router.post('/:eventId/backline-items', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
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
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
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
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const item = await loadOwnedBacklineItem(req.membership.accountId, req.params.eventId, req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Backline item not found.' });
  await prisma.stagePlotBacklineItem.delete({ where: { id: item.id } });
  res.json({ ok: true });
}));

export default router;
