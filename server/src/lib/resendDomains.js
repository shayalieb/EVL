import { getResendClient } from './resend.js';
import { ROOT_DOMAIN } from './godaddyDns.js';

// Registers `${subdomain}.gigworks.io` with Resend and asks for both
// sending and receiving records — receiving is what lets the existing
// reply-to-thread feature (server/src/routes/emailWebhooks.js) work on a
// business's own subdomain, same as it already does on the platform
// default. Returns Resend's domain id and its full DNS record list.
export async function createResendDomain(subdomain) {
  const resend = getResendClient();
  const { data, error } = await resend.domains.create({
    name: `${subdomain}.${ROOT_DOMAIN}`,
    capabilities: { sending: true, receiving: true },
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
