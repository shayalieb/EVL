import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { requireVertical } from '../lib/verticals.js';
import { uploadFile, getSignedDownloadUrl } from '../lib/fileStorage.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership), requireVertical('party_planning'));

function serializePlan(plan) {
  return {
    id: plan.id,
    eventId: plan.eventId,
    name: plan.name,
    pages: plan.pages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ id: p.id, order: p.order, name: p.name, scene: p.scene, hasThumbnail: !!p.thumbnailStorageKey })),
  };
}

// Get-or-create — same lazy-provisioning shape as stagePlots.js's GET
// /:eventId. Always has at least one page.
router.get('/:eventId', asyncHandler(async (req, res) => {
  const { accountId } = req.membership;
  const { eventId } = req.params;

  let plan = await prisma.floorPlan.findUnique({
    where: { accountId_eventId: { accountId, eventId } },
    include: { pages: true },
  });

  if (!plan) {
    plan = await prisma.floorPlan.create({
      data: {
        accountId,
        eventId,
        pages: { create: [{ order: 0, name: 'Page 1' }] },
      },
      include: { pages: true },
    });
  }

  res.json({ floorPlan: serializePlan(plan) });
}));

async function loadOwnedPlan(accountId, eventId) {
  return prisma.floorPlan.findUnique({ where: { accountId_eventId: { accountId, eventId } }, include: { pages: true } });
}

// Autosave — same debounced-client-side, per-page-write shape as
// stagePlots.js's PATCH /:eventId/pages/:pageId.
router.patch('/:eventId/pages/:pageId', asyncHandler(async (req, res) => {
  const plan = await loadOwnedPlan(req.membership.accountId, req.params.eventId);
  if (!plan) return res.status(404).json({ error: 'Floor plan not found.' });
  const page = plan.pages.find((p) => p.id === req.params.pageId);
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

  const updated = await prisma.floorPlanPage.update({ where: { id: page.id }, data });
  res.json({ page: { id: updated.id, order: updated.order, name: updated.name, scene: updated.scene, hasThumbnail: !!updated.thumbnailStorageKey } });
}));

// Returns the signed URL as JSON, not a redirect — see stagePlots.js's
// identical route for why (credentialed fetch + Supabase's wildcard CORS
// header can't mix).
router.get('/:eventId/pages/:pageId/thumbnail', asyncHandler(async (req, res) => {
  const plan = await loadOwnedPlan(req.membership.accountId, req.params.eventId);
  const page = plan?.pages.find((p) => p.id === req.params.pageId);
  if (!page?.thumbnailStorageKey) return res.status(404).json({ error: 'No thumbnail yet.' });
  const url = await getSignedDownloadUrl(page.thumbnailStorageKey, `${page.name || 'page'}.png`);
  res.json({ url });
}));

router.post('/:eventId/pages', asyncHandler(async (req, res) => {
  const plan = await loadOwnedPlan(req.membership.accountId, req.params.eventId);
  if (!plan) return res.status(404).json({ error: 'Floor plan not found.' });
  const nextOrder = plan.pages.reduce((max, p) => Math.max(max, p.order), -1) + 1;
  const page = await prisma.floorPlanPage.create({
    data: { floorPlanId: plan.id, order: nextOrder, name: req.body?.name || `Page ${nextOrder + 1}` },
  });
  res.status(201).json({ page: { id: page.id, order: page.order, name: page.name, scene: page.scene, hasThumbnail: false } });
}));

router.delete('/:eventId/pages/:pageId', asyncHandler(async (req, res) => {
  const plan = await loadOwnedPlan(req.membership.accountId, req.params.eventId);
  if (!plan) return res.status(404).json({ error: 'Floor plan not found.' });
  if (plan.pages.length <= 1) return res.status(400).json({ error: 'A floor plan needs at least one page.' });
  const page = plan.pages.find((p) => p.id === req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Page not found.' });
  await prisma.floorPlanPage.delete({ where: { id: page.id } });
  res.json({ ok: true });
}));

export default router;
