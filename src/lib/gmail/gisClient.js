// Google Identity Services token client wrapper. Access tokens are kept
// in-memory only (never persisted) — see plan notes on why localStorage is
// unsafe for a live bearer credential. A page reload just re-derives a
// fresh token (silently, if the browser still has a live Google session).
const SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email';
const EXPIRY_SAFETY_BUFFER_MS = 60_000;

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

function getClientId() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured. See .env.example.');
  }
  return clientId;
}

function getTokenClient() {
  if (tokenClient) return tokenClient;
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services failed to load. Check your connection and try again.');
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: getClientId(),
    scope: SCOPES,
    callback: '',
  });
  return tokenClient;
}

function requestToken({ interactive }) {
  return new Promise((resolve, reject) => {
    const client = getTokenClient();
    client.callback = (resp) => {
      if (resp.error) { reject(resp); return; }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + Number(resp.expires_in) * 1000 - EXPIRY_SAFETY_BUFFER_MS;
      resolve(accessToken);
    };
    client.error_callback = (err) => reject(err);
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

// Returns a valid access token, silently refreshing if possible and only
// falling back to an interactive consent popup when necessary. Must be
// called from within a user-gesture handler (e.g. a button click).
// Pass interactive: true to skip the silent attempt (e.g. an explicit
// "Connect Google Account" click, where no prior consent is expected).
export async function ensureFreshToken({ interactive = false } = {}) {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  if (interactive) return requestToken({ interactive: true });
  try {
    return await requestToken({ interactive: false });
  } catch {
    return requestToken({ interactive: true });
  }
}

export function forgetToken() {
  accessToken = null;
  tokenExpiresAt = 0;
}

export async function fetchConnectedEmail(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not read the connected Google account email.');
  const data = await res.json();
  return data.email;
}

export function disconnectGmail() {
  const token = accessToken;
  forgetToken();
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token);
  }
}
