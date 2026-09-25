import { getResendClient } from './resend.js';

// Registers a full domain (gigworks.io subdomain or a business's own
// domain — caller decides which, this is agnostic) with Resend, asking for
// both sending and receiving records — receiving is what lets the existing
// reply-to-thread feature (server/src/routes/emailWebhooks.js) work on it,
// same as it already does on the platform default. Returns Resend's domain
// id and its full DNS record list.
export async function createResendDomain(fullDomainName) {
  const resend = getResendClient();
  // The installed SDK drops capabilities from domains.create; use its raw
  // authenticated transport to preserve both capabilities.
  const { data, error } = await resend.post('/domains', {
    name: fullDomainName,
    capabilities: { sending: 'enabled', receiving: 'enabled' },
  });
  if (error) throw new Error(error.message || 'Failed to create Resend domain.');
  return { resendDomainId: data.id, dnsRecords: data.records };
}

// Resend rechecks DNS on its own timer, but this lets a "Check Status"
// click in Settings force an immediate recheck instead of waiting.
export async function verifyResendDomain(resendDomainId) {
  const resend = getResendClient();
  const { error } = await resend.domains.verify(resendDomainId);
  if (error) throw new Error(error.message || 'Failed to trigger domain verification.');
  return getResendDomainStatus(resendDomainId);
}

export async function getResendDomainStatus(resendDomainId) {
  const resend = getResendClient();
  const { data, error } = await resend.domains.get(resendDomainId);
  if (error) throw new Error(error.message || 'Failed to fetch domain status.');
  return { status: data.status, dnsRecords: data.records };
}

export async function deleteResendDomain(resendDomainId) {
  if (!resendDomainId) return;
  const resend = getResendClient();
  const { error } = await resend.domains.remove(resendDomainId);
  if (error) throw new Error(error.message || 'Failed to remove Resend domain.');
}

export async function enableResendDomainReceiving(resendDomainId) {
  const resend = getResendClient();
  const { error } = await resend.patch(`/domains/${encodeURIComponent(resendDomainId)}`, {
    capabilities: { sending: 'enabled', receiving: 'enabled' },
  });
  if (error) throw new Error(error.message || 'Could not enable receiving.');
  return getResendDomainStatus(resendDomainId);
}
