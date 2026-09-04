import crypto from 'node:crypto';
import { decryptSecret, encryptSecret } from './secretBox.js';

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const API_URL = 'https://quickbooks.api.intuit.com';

export function quickBooksConfigured(env = process.env) {
  return !!(env.QUICKBOOKS_CLIENT_ID && env.QUICKBOOKS_CLIENT_SECRET && env.QUICKBOOKS_REDIRECT_URI && env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY);
}

function stateSignature(payload, secret = process.env.SESSION_SECRET) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createQuickBooksState({ accountId, userId, now = Date.now() }, secret) {
  const payload = Buffer.from(JSON.stringify({ accountId, userId, nonce: crypto.randomBytes(16).toString('hex'), exp: now + 10 * 60 * 1000 })).toString('base64url');
  return `${payload}.${stateSignature(payload, secret)}`;
}

export function verifyQuickBooksState(state, { userId, now = Date.now() }, secret) {
  const [payload, signature] = String(state || '').split('.');
  const expected = payload ? stateSignature(payload, secret) : '';
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid QuickBooks connection state.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!decoded.accountId || decoded.userId !== userId || decoded.exp < now) throw new Error('QuickBooks connection state expired.');
  return decoded;
}

export function quickBooksAuthorizationUrl({ state }, env = process.env) {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', env.QUICKBOOKS_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.QUICKBOOKS_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'com.intuit.quickbooks.accounting');
  url.searchParams.set('state', state);
  return url.toString();
}

async function tokenRequest(params, env = process.env) {
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${env.QUICKBOOKS_CLIENT_ID}:${env.QUICKBOOKS_CLIENT_SECRET}`).toString('base64')}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'QuickBooks authorization failed.');
  return data;
}

export function exchangeQuickBooksCode(code, env) {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: (env || process.env).QUICKBOOKS_REDIRECT_URI }, env);
}

export function refreshQuickBooksTokens(refreshToken, env) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, env);
}

export async function fetchQuickBooksCompany({ realmId, accessToken }) {
  const response = await fetch(`${API_URL}/v3/company/${encodeURIComponent(realmId)}/companyinfo/${encodeURIComponent(realmId)}?minorversion=75`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Unable to read the connected QuickBooks company.');
  return data.CompanyInfo || data.QueryResponse?.CompanyInfo?.[0] || {};
}

export async function queryQuickBooks({ realmId, accessToken, query }) {
  const url = new URL(`${API_URL}/v3/company/${encodeURIComponent(realmId)}/query`);
  url.searchParams.set('query', query);
  url.searchParams.set('minorversion', '75');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.Fault) throw new Error(data.Fault?.Error?.[0]?.Message || 'Unable to read QuickBooks accounting data.');
  return data.QueryResponse || {};
}

export async function writeQuickBooks({ realmId, accessToken, entity, body, requestId }) {
  const url = new URL(`${API_URL}/v3/company/${encodeURIComponent(realmId)}/${encodeURIComponent(entity)}`);
  url.searchParams.set('minorversion', '75');
  if (requestId) url.searchParams.set('requestid', String(requestId).slice(0, 50));
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.Fault) throw new Error(data.Fault?.Error?.[0]?.Detail || data.Fault?.Error?.[0]?.Message || `Unable to create QuickBooks ${entity}.`);
  return data;
}

export async function revokeQuickBooksToken(token, env = process.env) {
  const response = await fetch(REVOKE_URL, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${env.QUICKBOOKS_CLIENT_ID}:${env.QUICKBOOKS_CLIENT_SECRET}`).toString('base64')}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  if (!response.ok) throw new Error('QuickBooks token revocation failed.');
}

export function encryptedQuickBooksTokens(tokens, now = Date.now()) {
  return {
    accessTokenEncrypted: encryptSecret(tokens.access_token),
    refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
    accessTokenExpiresAt: new Date(now + Number(tokens.expires_in || 3600) * 1000),
    refreshTokenExpiresAt: tokens.x_refresh_token_expires_in ? new Date(now + Number(tokens.x_refresh_token_expires_in) * 1000) : null,
  };
}

export function decryptedRefreshToken(connection) {
  return decryptSecret(connection.refreshTokenEncrypted);
}

export function decryptedAccessToken(connection) {
  return decryptSecret(connection.accessTokenEncrypted);
}

export async function validQuickBooksAccess(connection) {
  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return { accessToken: decryptedAccessToken(connection), tokenData: null };
  const oldRefreshToken = decryptedRefreshToken(connection);
  const refreshed = await refreshQuickBooksTokens(oldRefreshToken);
  return { accessToken: refreshed.access_token, tokenData: encryptedQuickBooksTokens({ ...refreshed, refresh_token: refreshed.refresh_token || oldRefreshToken }) };
}
