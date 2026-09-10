import crypto from 'node:crypto';
import { decryptSecret, encryptSecret } from './secretBox.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API_URL = 'https://www.googleapis.com/calendar/v3';
const SCOPES = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly'];

function encryptionSecret(env = process.env) { return env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY; }
export function googleCalendarConfigured(env = process.env) { return !!(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET && env.GOOGLE_CALENDAR_REDIRECT_URI && encryptionSecret(env)); }
function sign(payload, secret = process.env.SESSION_SECRET) { return crypto.createHmac('sha256', secret).update(payload).digest('base64url'); }
export function createGoogleCalendarState({ accountId, userId, now = Date.now() }, secret) {
  const payload = Buffer.from(JSON.stringify({ accountId, userId, nonce: crypto.randomBytes(16).toString('hex'), exp: now + 10 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}
export function verifyGoogleCalendarState(state, { userId, now = Date.now() }, secret) {
  const [payload, signature] = String(state || '').split('.');
  const expected = payload ? sign(payload, secret) : '';
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid Google Calendar connection state.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!decoded.accountId || decoded.userId !== userId || decoded.exp < now) throw new Error('Google Calendar connection state expired.');
  return decoded;
}
export function googleCalendarAuthorizationUrl({ state }, env = process.env) {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', env.GOOGLE_CALENDAR_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GOOGLE_CALENDAR_REDIRECT_URI);
  url.searchParams.set('response_type', 'code'); url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline'); url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent'); url.searchParams.set('state', state);
  return url.toString();
}
async function tokenRequest(params, env = process.env) {
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET, ...params }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Google Calendar authorization failed.');
  return data;
}
export function exchangeGoogleCalendarCode(code, env = process.env) { return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: env.GOOGLE_CALENDAR_REDIRECT_URI }, env); }
export function encryptedGoogleCalendarTokens(tokens, previousRefreshToken = null, now = Date.now(), env = process.env) {
  const secret = encryptionSecret(env);
  return { accessTokenEncrypted: encryptSecret(tokens.access_token, secret), refreshTokenEncrypted: tokens.refresh_token ? encryptSecret(tokens.refresh_token, secret) : previousRefreshToken, accessTokenExpiresAt: new Date(now + Number(tokens.expires_in || 3600) * 1000) };
}
export async function validGoogleCalendarAccess(connection, env = process.env) {
  const secret = encryptionSecret(env);
  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return { accessToken: decryptSecret(connection.accessTokenEncrypted, secret), tokenData: null };
  if (!connection.refreshTokenEncrypted) throw new Error('Google Calendar needs to be reconnected.');
  const refreshToken = decryptSecret(connection.refreshTokenEncrypted, secret);
  const tokens = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' }, env);
  return { accessToken: tokens.access_token, tokenData: encryptedGoogleCalendarTokens(tokens, connection.refreshTokenEncrypted, Date.now(), env) };
}
async function googleGet(path, accessToken, params = {}) {
  const url = new URL(`${API_URL}${path}`); for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error?.message || 'Google Calendar request failed.'); return data;
}
export async function listGoogleCalendars(accessToken) {
  const data = await googleGet('/users/me/calendarList', accessToken, { maxResults: '250' });
  return (data.items || []).filter((item) => !item.deleted).map((item) => ({ id: item.id, name: item.summary || item.id, primary: !!item.primary, accessRole: item.accessRole }));
}
export async function listGoogleCalendarEvents(accessToken, calendarId, maxEvents = 2500) {
  const events = []; let pageToken;
  do {
    const data = await googleGet(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, { maxResults: String(Math.min(2500, maxEvents - events.length)), pageToken, singleEvents: 'true', showDeleted: 'false' });
    events.push(...(data.items || []).filter((item) => item.status !== 'cancelled' && (item.start?.date || item.start?.dateTime)));
    pageToken = data.nextPageToken;
  } while (pageToken && events.length < maxEvents);
  return events.slice(0, maxEvents);
}
function icsEscape(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsDate(value) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.replace(/-/g, '');
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text.replace(/[-:]/g, '') : parsed.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
export function googleEventsToIcs(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GigWorks//Google Calendar Import//EN'];
  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${icsEscape(event.iCalUID || event.id)}`, `SUMMARY:${icsEscape(event.summary || 'Untitled event')}`);
    if (event.start?.date) lines.push(`DTSTART;VALUE=DATE:${icsDate(event.start.date)}`); else lines.push(`DTSTART:${icsDate(event.start?.dateTime)}`);
    if (event.end?.date) lines.push(`DTEND;VALUE=DATE:${icsDate(event.end.date)}`); else if (event.end?.dateTime) lines.push(`DTEND:${icsDate(event.end.dateTime)}`);
    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`); if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
    for (const attendee of event.attendees || []) if (attendee.email) lines.push(`ATTENDEE:mailto:${icsEscape(attendee.email)}`);
    lines.push('END:VEVENT');
  }
  return `${lines.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
}
export async function revokeGoogleCalendarToken(token) { const response = await fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }); if (!response.ok) throw new Error('Google Calendar token revocation failed.'); }
