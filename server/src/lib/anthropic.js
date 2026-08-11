import Anthropic from '@anthropic-ai/sdk';

// Constructed lazily (not at module load) — the Anthropic SDK throws
// synchronously if no API key is present, which would otherwise crash the
// entire server on boot whenever ANTHROPIC_API_KEY isn't set yet, not just
// the AI reply-classification feature. Mirrors resend.js's getResendClient().
let client = null;

export function getAnthropicClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('AI reply classification is not configured yet (ANTHROPIC_API_KEY is missing).');
  }
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}
