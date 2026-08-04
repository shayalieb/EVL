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
    include: { pages: true, channels: true },
  });

  if (!plot) {
    plot = await prisma.stagePlot.create({
      data: {
        accountId,
        eventId,
        pages: { create: [{ order: 0, name: 'Page 1' }] },
      },
      include: { pages: true, channels: true },
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
router.delete('/:eventId/pages/:pageId', asyncHandler(async (req, res) => {
  const plot = await loadOwnedPlot(req.membership.accountId, req.params.eventId);
  if (!plot) return res.status(404).json({ error: 'Stage plot not found.' });
  if (plot.pages.length <= 1) return res.status(400).json({ error: 'A stage plot needs at least one page.' });
  const page = plot.pages.find((p) => p.id === req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Page not found.' });
  await prisma.stagePlotPage.delete({ where: { id: page.id } });
  res.json({ ok: true });
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
  const { source, micOrDi, standType, phantomPower, monitorNotes, elementId } = req.body || {};
  if (!source?.trim()) return res.status(400).json({ error: 'source is required.' });

  const nextChannelNumber = plot.channels.reduce((max, c) => Math.max(max, c.channelNumber), 0) + 1;
  const channel = await prisma.stagePlotChannel.create({
    data: {
      stagePlotId: plot.id,
      channelNumber: nextChannelNumber,
      source: source.trim(),
      micOrDi: micOrDi || null,
      standType: standType || null,
      phantomPower: !!phantomPower,
      monitorNotes: monitorNotes || null,
      elementId: elementId || null,
    },
  });
  res.status(201).json({ channel });
}));

async function loadOwnedChannel(accountId, eventId, channelId) {
  const channel = await prisma.stagePlotChannel.findUnique({ where: { id: channelId }, include: { stagePlot: true } });
  if (!channel || channel.stagePlot.accountId !== accountId || channel.stagePlot.eventId !== eventId) return null;
  return channel;
}

router.patch('/:eventId/channels/:channelId', asyncHandler(async (req, res) => {
  const channel = await loadOwnedChannel(req.membership.accountId, req.params.eventId, req.params.channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found.' });

  const { channelNumber, source, micOrDi, standType, phantomPower, monitorNotes, elementId } = req.body || {};
  const data = {};
  if (channelNumber !== undefined) data.channelNumber = channelNumber;
  if (source !== undefined) data.source = source;
  if (micOrDi !== undefined) data.micOrDi = micOrDi || null;
  if (standType !== undefined) data.standType = standType || null;
  if (phantomPower !== undefined) data.phantomPower = !!phantomPower;
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

export default router;
