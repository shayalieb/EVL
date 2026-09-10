import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createGoogleCalendarState, encryptedGoogleCalendarTokens, exchangeGoogleCalendarCode, googleCalendarAuthorizationUrl, googleCalendarConfigured, googleEventsToIcs, listGoogleCalendarEvents, listGoogleCalendars, revokeGoogleCalendarToken, validGoogleCalendarAccess, verifyGoogleCalendarState } from '../lib/googleCalendar.js';
import { decryptSecret } from '../lib/secretBox.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function requireImportPermission(req, res) {
  if (!effectivePermissions(req.membership).manageBookings) { res.status(403).json({ error: 'Not authorized.' }); return false; }
  return true;
}
function statusJson(connection) { return { configured: googleCalendarConfigured(), connected: connection?.status === 'active', status: connection?.status || 'not_connected', googleEmail: connection?.googleEmail || null, connectedAt: connection?.createdAt || null, lastError: connection?.lastError || null }; }
async function connectionWithAccess(accountId) {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { accountId } });
  if (!connection || connection.status !== 'active') throw new Error('Connect Google Calendar first.');
  const access = await validGoogleCalendarAccess(connection);
  if (access.tokenData) await prisma.googleCalendarConnection.update({ where: { id: connection.id }, data: { ...access.tokenData, status: 'active', lastError: null } });
  return { connection, accessToken: access.accessToken };
}

router.get('/status', asyncHandler(async (req, res) => { if (!requireImportPermission(req, res)) return; res.json({ connection: statusJson(await prisma.googleCalendarConnection.findUnique({ where: { accountId: req.membership.accountId } })) }); }));
router.post('/connect-url', asyncHandler(async (req, res) => {
  if (!requireImportPermission(req, res)) return;
  if (!googleCalendarConfigured()) return res.status(503).json({ error: 'Google Calendar OAuth is not configured for this GigWorks environment.' });
  res.json({ url: googleCalendarAuthorizationUrl({ state: createGoogleCalendarState({ accountId: req.membership.accountId, userId: req.session.userId }) }) });
}));
router.get('/callback', asyncHandler(async (req, res) => {
  const destination = new URL('/import', (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''));
  try {
    if (!requireImportPermission(req, res)) return;
    if (req.query.error) throw new Error('Google Calendar connection was cancelled.');
    const state = verifyGoogleCalendarState(req.query.state, { userId: req.session.userId });
    if (state.accountId !== req.membership.accountId) throw new Error('Google Calendar connection does not match this account.');
    const tokens = await exchangeGoogleCalendarCode(String(req.query.code || ''));
    const existing = await prisma.googleCalendarConnection.findUnique({ where: { accountId: req.membership.accountId } });
    const tokenData = encryptedGoogleCalendarTokens(tokens, existing?.refreshTokenEncrypted || null);
    await prisma.googleCalendarConnection.upsert({ where: { accountId: req.membership.accountId }, update: { ...tokenData, connectedByUserId: req.session.userId, status: 'active', lastError: null }, create: { accountId: req.membership.accountId, ...tokenData, connectedByUserId: req.session.userId } });
    await prisma.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'google_calendar_connected', summary: 'Google Calendar connected with read-only access' } });
    destination.searchParams.set('googleCalendar', 'connected');
  } catch (error) { destination.searchParams.set('googleCalendar', 'error'); destination.searchParams.set('message', String(error.message || 'Unable to connect Google Calendar.').slice(0, 180)); }
  res.redirect(destination.toString());
}));
router.get('/calendars', asyncHandler(async (req, res) => { if (!requireImportPermission(req, res)) return; const { accessToken } = await connectionWithAccess(req.membership.accountId); res.json({ calendars: await listGoogleCalendars(accessToken) }); }));
router.post('/export', asyncHandler(async (req, res) => {
  if (!requireImportPermission(req, res)) return;
  const calendarId = String(req.body?.calendarId || '').trim(); if (!calendarId || calendarId.length > 1024) return res.status(400).json({ error: 'Choose a Google Calendar.' });
  const { accessToken } = await connectionWithAccess(req.membership.accountId);
  const calendars = await listGoogleCalendars(accessToken); if (!calendars.some((calendar) => calendar.id === calendarId)) return res.status(400).json({ error: 'That calendar is not available to this Google account.' });
  const events = await listGoogleCalendarEvents(accessToken, calendarId);
  res.json({ calendarIcs: googleEventsToIcs(events), eventCount: events.length, limited: events.length >= 2500 });
}));
router.delete('/connection', asyncHandler(async (req, res) => {
  if (!requireImportPermission(req, res)) return;
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { accountId: req.membership.accountId } });
  if (connection) { try { await revokeGoogleCalendarToken(decryptSecret(connection.refreshTokenEncrypted || connection.accessTokenEncrypted, process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY)); } catch { /* Local disconnect still wins. */ } }
  const removed = await prisma.googleCalendarConnection.deleteMany({ where: { accountId: req.membership.accountId } });
  if (removed.count) await prisma.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'google_calendar_disconnected', summary: 'Google Calendar disconnected' } });
  res.json({ connection: statusJson(null) });
}));

export default router;
