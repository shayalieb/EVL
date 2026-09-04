import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions, requireRole } from '../lib/membership.js';
import { createQuickBooksState, decryptedRefreshToken, encryptedQuickBooksTokens, exchangeQuickBooksCode, fetchQuickBooksCompany, queryQuickBooks, quickBooksAuthorizationUrl, quickBooksConfigured, revokeQuickBooksToken, validQuickBooksAccess, verifyQuickBooksState } from '../lib/quickBooks.js';
import { normalizeQuickBooksItem, normalizeQuickBooksReference, quickBooksSetupReadiness, suggestedQuickBooksMappings, validateQuickBooksMappings } from '../lib/quickBooksMappings.js';

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

function setupJson(connection, agencyGroups = []) {
  if (!connection) return { accounts: [], classes: [], locations: [], mappings: {}, referenceDataRefreshedAt: null, readiness: { ready: false, checks: [], errors: [] } };
  return { accounts: connection.accountsSnapshot || [], classes: connection.classesSnapshot || [], locations: connection.locationsSnapshot || [], items: connection.itemsSnapshot || [], agencyGroups, mappings: connection.accountingMappings || {}, referenceDataRefreshedAt: connection.referenceDataRefreshedAt, setupCompletedAt: connection.setupCompletedAt, readiness: quickBooksSetupReadiness(connection, agencyGroups) };
}

function accountAgencyGroups(accountId) {
  return prisma.agencyGroup.findMany({ where: { accountId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
}

async function fetchReferenceData(connection, accessToken) {
  const accountsResponse = await queryQuickBooks({ realmId: connection.realmId, accessToken, query: 'select * from Account maxresults 1000' });
  const [classesResponse, locationsResponse, itemsResponse] = await Promise.all([
    queryQuickBooks({ realmId: connection.realmId, accessToken, query: 'select * from Class maxresults 1000' }).catch(() => ({ Class: [] })),
    queryQuickBooks({ realmId: connection.realmId, accessToken, query: 'select * from Department maxresults 1000' }).catch(() => ({ Department: [] })),
    queryQuickBooks({ realmId: connection.realmId, accessToken, query: 'select * from Item maxresults 1000' }),
  ]);
  return {
    accountsSnapshot: (accountsResponse.Account || []).map(normalizeQuickBooksReference).filter((item) => item.active),
    classesSnapshot: (classesResponse.Class || []).map(normalizeQuickBooksReference).filter((item) => item.active),
    locationsSnapshot: (locationsResponse.Department || []).map(normalizeQuickBooksReference).filter((item) => item.active),
    itemsSnapshot: (itemsResponse.Item || []).map(normalizeQuickBooksItem).filter((item) => item.active),
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
    const { accessToken, tokenData } = await validQuickBooksAccess(connection);
    const company = await fetchQuickBooksCompany({ realmId: connection.realmId, accessToken });
    const updated = await prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { ...(tokenData || {}), companyName: company.CompanyName || connection.companyName, country: company.Country || connection.country, status: 'active', lastHealthCheckAt: new Date(), lastError: null } });
    res.json({ connection: statusJson(updated) });
  } catch (error) {
    const updated = await prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { status: 'needs_reauthorization', lastHealthCheckAt: new Date(), lastError: String(error?.message || 'Connection check failed.').slice(0, 500) } });
    res.status(409).json({ error: 'QuickBooks needs to be reconnected.', connection: statusJson(updated) });
  }
}));

router.get('/setup', asyncHandler(async (req, res) => {
  const [connection, agencyGroups] = await Promise.all([prisma.quickBooksConnection.findUnique({ where: { accountId: req.membership.accountId } }), accountAgencyGroups(req.membership.accountId)]);
  if (!connection) return res.status(404).json({ error: 'Connect QuickBooks before configuring accounting.' });
  res.json({ setup: setupJson(connection, agencyGroups) });
}));

router.post('/reference-data', asyncHandler(async (req, res) => {
  if (!requireSettingsPermission(req, res)) return;
  const connection = await prisma.quickBooksConnection.findUnique({ where: { accountId: req.membership.accountId } });
  if (!connection || connection.status !== 'active') return res.status(409).json({ error: 'Connect QuickBooks before importing accounts.' });
  try {
    const { accessToken, tokenData } = await validQuickBooksAccess(connection);
    const referenceData = await fetchReferenceData(connection, accessToken);
    if (!referenceData.accountsSnapshot.length) return res.status(409).json({ error: 'No active accounts were returned by QuickBooks.' });
    const existingMappings = connection.accountingMappings && Object.keys(connection.accountingMappings).length ? connection.accountingMappings : suggestedQuickBooksMappings(referenceData.accountsSnapshot, referenceData.itemsSnapshot);
    const updated = await prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { ...(tokenData || {}), ...referenceData, accountingMappings: existingMappings, referenceDataRefreshedAt: new Date(), setupCompletedAt: null, lastError: null } });
    res.json({ setup: setupJson(updated, await accountAgencyGroups(req.membership.accountId)) });
  } catch (error) {
    await prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { lastError: String(error?.message || 'Reference import failed.').slice(0, 500) } });
    res.status(502).json({ error: 'Unable to import the QuickBooks chart of accounts. Check the connection and try again.' });
  }
}));

router.put('/mappings', asyncHandler(async (req, res) => {
  if (!requireSettingsPermission(req, res)) return;
  const [connection, agencyGroups] = await Promise.all([prisma.quickBooksConnection.findUnique({ where: { accountId: req.membership.accountId } }), accountAgencyGroups(req.membership.accountId)]);
  if (!connection) return res.status(404).json({ error: 'Connect QuickBooks before configuring accounting.' });
  const { mappings, errors } = validateQuickBooksMappings(req.body, connection.accountsSnapshot, connection.classesSnapshot, connection.locationsSnapshot, agencyGroups, connection.itemsSnapshot);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  const updated = await prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { accountingMappings: mappings, setupCompletedAt: new Date(), lastError: null } });
  await prisma.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'quickbooks_mappings_updated', summary: 'QuickBooks accounting mappings updated', metadata: { agencyTrackingMode: mappings.agencyTrackingMode } } });
  res.json({ setup: setupJson(updated, agencyGroups) });
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
