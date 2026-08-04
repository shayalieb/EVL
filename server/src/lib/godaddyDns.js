// GoDaddy Domains API (v1) — used only to write the DNS records Resend's
// Domains API asks for onto the platform's own gigworks.io zone, so a
// business's chosen subdomain can be provisioned without anyone touching
// GoDaddy by hand. See server/src/lib/emailDomains.js for the caller.
//
// ROOT_DOMAIN is the zone every subdomain gets written into — this account
// only controls gigworks.io's DNS, so it's fixed rather than configurable.
const ROOT_DOMAIN = process.env.EMAIL_DOMAIN_ROOT || 'gigworks.io';

function authHeader() {
  if (!process.env.GODADDY_API_TOKEN) {
    throw new Error('DNS automation is not configured yet (GODADDY_API_TOKEN is missing).');
  }
  return { Authorization: `Bearer ${process.env.GODADDY_API_TOKEN}` };
}

async function godaddyFetch(path, options = {}) {
  const res = await fetch(`https://api.godaddy.com/v1${path}`, {
    ...options,
    headers: { ...authHeader(), 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GoDaddy API error (${res.status}) on ${path}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

// Additive — never replaces the domain's existing record set (that's a
// different, much more dangerous endpoint). `name` on each record must
// already be scoped to the subdomain (e.g. "acme" or "_dmarc.acme"), not the
// bare root — this only ever adds records under whatever `name`s it's given.
export async function addDnsRecords(records) {
  await godaddyFetch(`/domains/${ROOT_DOMAIN}/records`, {
    method: 'PATCH',
    body: JSON.stringify(records),
  });
}

export async function deleteDnsRecord(type, name) {
  await godaddyFetch(`/domains/${ROOT_DOMAIN}/records/${type}/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export { ROOT_DOMAIN };
