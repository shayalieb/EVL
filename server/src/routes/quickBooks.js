import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions, requireRole } from '../lib/membership.js';
import { createQuickBooksState, decryptedAccessToken, decryptedRefreshToken, encryptedQuickBooksTokens, exchangeQuickBooksCode, fetchQuickBooksCompany, quickBooksAuthorizationUrl, quickBooksConfigured, refreshQuickBooksTokens, revokeQuickBooksToken, verifyQuickBooksState } from '../lib/quickBooks.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership), requireRole('owner', 'admin'));

function requireSettingsPermission(req, res) {
  if (!effectivePermissions(req.membership).manageSettings) {
    res.status(403).json({ error: 'Not authorized.' });
    return false;
  }
  return true;
}

function statusJson(connection) {
  return {
    configured: quickBooksConfigured(),
    connected: !!connection && connection.status === 'active',
    status: connection?.status || 'not_connected',
    companyName: connection?.companyName || null,
    country: connection?.country || null,
    realmId: connection?.realmId || null,
    connectedAt: connection?.createdAt || null,
    lastHealthCheckAt: connection?.lastHealthCheckAt || null,
    lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt || null,
    lastError: connection?.lastError || null,
  };
}

router.get('/status', asyncHandler(async (req, res) => {
  const connection = await prisma.quickBooksConnection.findUnique({ where: { accountId: req.membership.accountId } });
  res.json({ connection: statusJson(connection) });
}));

router.post('/health', asyncHandler(async (req, res) => {
  if (!requireSettingsPermission(req, res)) return;
  const connection = await prisma.quickBooksConnection.findUnique({ where: { accountId: req.membership.accountId } });
  if (!connection) return res.status(404).json({ error: 'QuickBooks is not connected.' });
  try {
    let accessToken = decryptedAccessToken(connection);
    let tokenData = {};
    if (connection.accessTokenExpiresAt.getTime() <= Date.now() + 60_000) {
      const refreshed = await refreshQuickBooksTokens(decryptedRefreshToken(connection));
      accessToken = refreshed.access_token;
      tokenData = encryptedQuickBooksTokens({ ...refreshed, refresh_token: refreshed.refresh_token || decryptedRefreshToken(connection) });
    }
    const company = await fetchQuickBooksCompany({ realmId: connection.realmId, accessToken });
    const updated = await prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { ...tokenData, companyName: company.CompanyName || connection.companyName, country: company.Country || connection.country, status: 'active', lastHealthCheckAt: new Date(), lastError: null } });
    res.json({ connection: statusJson(updated) });
  } catch (error) {
    const updated = await prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { status: 'needs_reauthorization', lastHealthCheckAt: new Date(), lastError: String(error?.message || 'Connection check failed.').slice(0, 500) } });
    res.status(409).json({ error: 'QuickBooks needs to be reconnected.', connection: statusJson(updated) });
  }
}));

router.post('/connect-url', asyncHandler(async (req, res) => {
  if (!requireSettingsPermission(req, res)) return;
  if (!quickBooksConfigured()) return res.status(503).json({ error: 'QuickBooks is not configured for this GigWorks environment.' });
  const state = createQuickBooksState({ accountId: req.membership.accountId, userId: req.session.userId });
  res.json({ url: quickBooksAuthorizationUrl({ state }) });
}));

router.get('/callback', asyncHandler(async (req, res) => {
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const destination = new URL('/settings?tab=integrations', frontend);
  try {
    if (!requireSettingsPermission(req, res)) return;
    if (!quickBooksConfigured()) throw new Error('QuickBooks is not configured.');
    if (req.query.error) throw new Error('QuickBooks connection was cancelled.');
    const state = verifyQuickBooksState(req.query.state, { userId: req.session.userId });
    if (state.accountId !== req.membership.accountId) throw new Error('QuickBooks connection does not match this account.');
    const realmId = String(req.query.realmId || '').trim();
    const code = String(req.query.code || '').trim();
    if (!realmId || !code) throw new Error('QuickBooks did not return the required connection information.');
    const tokens = await exchangeQuickBooksCode(code);
    const company = await fetchQuickBooksCompany({ realmId, accessToken: tokens.access_token });
    const tokenData = encryptedQuickBooksTokens(tokens);
    await prisma.quickBooksConnection.upsert({
      where: { accountId: req.membership.accountId },
      update: { realmId, companyName: company.CompanyName || null, country: company.Country || null, ...tokenData, connectedByUserId: req.session.userId, status: 'active', lastHealthCheckAt: new Date(), lastError: null },
      create: { accountId: req.membership.accountId, realmId, companyName: company.CompanyName || null, country: company.Country || null, ...tokenData, connectedByUserId: req.session.userId, status: 'active', lastHealthCheckAt: new Date() },
    });
    await prisma.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'quickbooks_connected', summary: 'QuickBooks Online connected', metadata: { realmId, companyName: company.CompanyName || null } } });
    destination.searchParams.set('quickbooks', 'connected');
  } catch (error) {
    destination.searchParams.set('quickbooks', 'error');
    destination.searchParams.set('message', String(error?.message || 'Unable to connect QuickBooks.').slice(0, 180));
  }
  res.redirect(destination.toString());
}));

router.delete('/connection', asyncHandler(async (req, res) => {
  if (!requireSettingsPermission(req, res)) return;
  const connection = await prisma.quickBooksConnection.findUnique({ where: { accountId: req.membership.accountId } });
  if (connection && quickBooksConfigured()) {
    try { await revokeQuickBooksToken(decryptedRefreshToken(connection)); } catch { /* Local disconnect still wins if Intuit is unavailable. */ }
  }
  const removed = await prisma.quickBooksConnection.deleteMany({ where: { accountId: req.membership.accountId } });
  if (removed.count) await prisma.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'quickbooks_disconnected', summary: 'QuickBooks Online disconnected' } });
  res.json({ connection: statusJson(null) });
}));

export default router;
