import { prisma } from './prisma.js';
import { createResendDomain, verifyResendDomain } from './resendDomains.js';
import { addDnsRecords, ROOT_DOMAIN } from './godaddyDns.js';

const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// Reserved so a business can't claim a name the platform itself might need
// (the apex site, its own mail infra, admin tooling, etc).
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'mail', 'admin', 'app', 'ns1', 'ns2', 'gigworks']);

export function validateSubdomain(subdomain) {
  const value = (subdomain || '').trim().toLowerCase();
  if (!SUBDOMAIN_PATTERN.test(value)) {
    return { valid: false, error: 'Subdomain must be lowercase letters, numbers, and hyphens only.' };
  }
  if (RESERVED_SUBDOMAINS.has(value)) {
    return { valid: false, error: 'That subdomain is reserved.' };
  }
  return { valid: true, value };
}

// Resend's returned record `name` field isn't reliably documented as
// relative-to-subdomain vs. relative-to-root vs. fully-qualified — this
// normalizes any of those shapes into what GoDaddy's additive records API
// expects: a name relative to gigworks.io (the zone GoDaddy is writing
// into), e.g. "resend._domainkey.acme".
function normalizeRecordName(resendName, subdomain) {
  let name = (resendName || '').replace(/\.$/, '');
  const rootSuffix = `.${ROOT_DOMAIN}`;
  if (name.endsWith(rootSuffix)) name = name.slice(0, -rootSuffix.length);
  else if (name === ROOT_DOMAIN) name = '';
  const subdomainSuffix = `.${subdomain}`;
  if (name === subdomain || name.endsWith(subdomainSuffix)) return name;
  return name ? `${name}.${subdomain}` : subdomain;
}

// Full provisioning flow: register the subdomain with Resend, write the
// records it asks for into gigworks.io's zone via GoDaddy, save the row.
// Each account gets at most one (enforced by EmailDomain.accountId @unique).
export async function provisionEmailDomain(accountId, rawSubdomain) {
  const { valid, value: subdomain, error } = validateSubdomain(rawSubdomain);
  if (!valid) throw Object.assign(new Error(error), { status: 400 });

  let resendDomainId, dnsRecords;
  try {
    ({ resendDomainId, dnsRecords } = await createResendDomain(subdomain));
  } catch (err) {
    // Resend's own error messages are safe to show as-is (e.g. plan/domain
    // limits, invalid name) — surfacing them beats a generic 500 here,
    // since this is exactly the kind of failure an account owner needs to
    // actually understand to do anything about it.
    throw Object.assign(new Error(err.message || 'Could not create the email domain.'), { status: 502 });
  }

  const godaddyRecords = dnsRecords.map((r) => ({
    type: r.type,
    name: normalizeRecordName(r.name, subdomain),
    data: r.value,
    ttl: r.ttl || 3600,
    ...(r.priority ? { priority: r.priority } : {}),
  }));
  try {
    await addDnsRecords(godaddyRecords);
  } catch (err) {
    throw Object.assign(new Error(err.message || 'Domain was registered with Resend but the DNS records could not be added.'), { status: 502 });
  }

  try {
    return await prisma.emailDomain.create({
      data: { accountId, subdomain, resendDomainId, dnsRecords, status: 'pending' },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw Object.assign(new Error('That subdomain is already taken.'), { status: 409 });
    }
    throw err;
  }
}

export async function refreshEmailDomainStatus(accountId) {
  const existing = await prisma.emailDomain.findUnique({ where: { accountId } });
  if (!existing) return null;
  const { status, dnsRecords } = await verifyResendDomain(existing.resendDomainId);
  return prisma.emailDomain.update({
    where: { accountId },
    data: { status, dnsRecords, verifiedAt: status === 'verified' ? new Date() : existing.verifiedAt },
  });
}

export async function getEmailDomain(accountId) {
  return prisma.emailDomain.findUnique({ where: { accountId } });
}

// For the mailer — only ever returns a domain that's actually confirmed
// usable, so callers never need to re-check status themselves.
export async function getVerifiedEmailDomain(accountId) {
  const domain = await prisma.emailDomain.findUnique({ where: { accountId } });
  return domain?.status === 'verified' ? domain : null;
}
