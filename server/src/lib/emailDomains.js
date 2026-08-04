import { prisma } from './prisma.js';
import { createResendDomain, verifyResendDomain } from './resendDomains.js';
import { addDnsRecords, ROOT_DOMAIN } from './godaddyDns.js';

const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// Reserved so a business can't claim a name the platform itself might need
// (the apex site, its own mail infra, admin tooling, etc).
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'mail', 'admin', 'app', 'ns1', 'ns2', 'gigworks']);
// Deliberately simple — just enough to reject obvious junk before an
// external API call. A hostname with at least one dot and no spaces/@.
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

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

// Custom domains must be a business's own — never gigworks.io itself or a
// subdomain of it, since that path is the auto-provisioned one above.
export function validateCustomDomain(domain) {
  const value = (domain || '').trim().toLowerCase();
  if (!DOMAIN_PATTERN.test(value)) {
    return { valid: false, error: 'Enter a valid domain (e.g. mail.yourcompany.com).' };
  }
  if (value === ROOT_DOMAIN || value.endsWith(`.${ROOT_DOMAIN}`)) {
    return { valid: false, error: `Use the "${ROOT_DOMAIN} subdomain" option above for a ${ROOT_DOMAIN} address instead.` };
  }
  return { valid: true, value };
}

// Resend's returned record `name` field isn't reliably documented as
// relative-to-subdomain vs. relative-to-root vs. fully-qualified — this
// normalizes any of those shapes into what GoDaddy's additive records API
// expects: a name relative to gigworks.io (the zone GoDaddy is writing
// into), e.g. "resend._domainkey.acme". Only used for the gigworks.io
// subdomain path — custom domains are never written anywhere by this app,
// so their records are shown to the business exactly as Resend returned
// them (they'll interpret "name" themselves in their own DNS provider's UI).
function normalizeRecordName(resendName, subdomain) {
  let name = (resendName || '').replace(/\.$/, '');
  const rootSuffix = `.${ROOT_DOMAIN}`;
  if (name.endsWith(rootSuffix)) name = name.slice(0, -rootSuffix.length);
  else if (name === ROOT_DOMAIN) name = '';
  const subdomainSuffix = `.${subdomain}`;
  if (name === subdomain || name.endsWith(subdomainSuffix)) return name;
  return name ? `${name}.${subdomain}` : subdomain;
}

async function saveEmailDomain({ accountId, domain, isCustomDomain, resendDomainId, dnsRecords }) {
  try {
    return await prisma.emailDomain.create({
      data: { accountId, domain, isCustomDomain, resendDomainId, dnsRecords, status: 'pending' },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw Object.assign(new Error('That domain is already in use.'), { status: 409 });
    }
    throw err;
  }
}

// Registers `${subdomain}.gigworks.io` with Resend, then writes the
// records it asks for into gigworks.io's zone via GoDaddy — fully
// automated, since this account controls that DNS. Each account gets at
// most one EmailDomain row either way (enforced by @unique on accountId).
export async function provisionEmailDomain(accountId, rawSubdomain) {
  const { valid, value: subdomain, error } = validateSubdomain(rawSubdomain);
  if (!valid) throw Object.assign(new Error(error), { status: 400 });
  const domain = `${subdomain}.${ROOT_DOMAIN}`;

  let resendDomainId, dnsRecords;
  try {
    ({ resendDomainId, dnsRecords } = await createResendDomain(domain));
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

  return saveEmailDomain({ accountId, domain, isCustomDomain: false, resendDomainId, dnsRecords });
}

// Registers a business's own domain with Resend and stops there — this app
// doesn't control that DNS, so the returned records are just saved for
// display (see EmailDomainTab.jsx) as instructions for the business to add
// themselves wherever their domain's DNS actually lives.
export async function provisionCustomEmailDomain(accountId, rawDomain) {
  const { valid, value: domain, error } = validateCustomDomain(rawDomain);
  if (!valid) throw Object.assign(new Error(error), { status: 400 });

  let resendDomainId, dnsRecords;
  try {
    ({ resendDomainId, dnsRecords } = await createResendDomain(domain));
  } catch (err) {
    throw Object.assign(new Error(err.message || 'Could not create the email domain.'), { status: 502 });
  }

  return saveEmailDomain({ accountId, domain, isCustomDomain: true, resendDomainId, dnsRecords });
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
