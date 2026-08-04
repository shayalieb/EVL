import { apiFetch } from '../context/AuthContext';

// Returns { domain, rootDomain } — domain is null until one's been configured.
export async function getEmailDomain() {
  return apiFetch('/email-domains');
}

export async function createEmailDomain(subdomain) {
  const data = await apiFetch('/email-domains', { method: 'POST', body: JSON.stringify({ subdomain }) });
  return data.domain;
}

export async function verifyEmailDomain() {
  const data = await apiFetch('/email-domains/verify', { method: 'POST' });
  return data.domain;
}
