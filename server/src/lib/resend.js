import { Resend } from 'resend';

// Constructed lazily (not at module load) — the Resend SDK throws
// synchronously if no API key is present, which would otherwise crash the
// entire server on boot whenever RESEND_API_KEY isn't set yet, not just the
// email feature.
let client = null;

export function getResendClient() {
  if (client) return client;
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email sending is not configured yet (RESEND_API_KEY is missing).');
  }
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}
