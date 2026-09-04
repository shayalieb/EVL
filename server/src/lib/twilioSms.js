import crypto from 'node:crypto';

function credentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) throw Object.assign(new Error('SMS provider is not configured.'), { status: 503, code: 'SMS_PROVIDER_NOT_CONFIGURED' });
  return { accountSid, authToken };
}

export function smsProviderConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());
}

export async function sendSms({ from, to, body, messagingServiceSid, statusCallback }) {
  const { accountSid, authToken } = credentials();
  const form = new URLSearchParams({ To: to, Body: body });
  if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);
  else form.set('From', from);
  if (statusCallback) form.set('StatusCallback', statusCallback);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.message || 'The text message could not be sent.'), { status: response.status < 500 ? 400 : 502, code: payload.code ? String(payload.code) : 'SMS_PROVIDER_ERROR' });
  return { id: payload.sid, status: payload.status || 'queued', from: payload.from || from, to: payload.to || to };
}

// Twilio signs the complete externally-visible URL followed by each sorted
// form field. Rejecting unsigned callbacks prevents forged replies/statuses.
export function validateTwilioSignature({ url, params, signature }) {
  const { authToken } = credentials();
  const data = Object.keys(params || {}).sort().reduce((text, key) => `${text}${key}${params[key]}`, url);
  const expected = crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
