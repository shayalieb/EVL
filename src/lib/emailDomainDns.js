export const DNS_PROVIDERS = [
  { id: 'cloudflare', label: 'Cloudflare' },
  { id: 'godaddy', label: 'GoDaddy' },
  { id: 'namecheap', label: 'Namecheap' },
  { id: 'squarespace', label: 'Squarespace Domains' },
  { id: 'other', label: 'Other provider' },
];

export const DNS_PROVIDER_GUIDANCE = {
  cloudflare: 'Open DNS → Records. Add each record exactly as shown. Any email-related CNAME must be DNS only (gray cloud), not proxied.',
  godaddy: 'Open Domain Portfolio → DNS → Add New Record. GoDaddy may append your domain automatically; check the preview before saving.',
  namecheap: 'Open Advanced DNS → Host Records. Namecheap usually wants only the host portion and appends your domain automatically.',
  squarespace: 'Open Domains → DNS Settings → Custom Records. Add every record separately and keep existing Google or Microsoft mail records.',
  other: 'Open the DNS or zone editor where your domain is hosted. Add every record separately and check whether the provider appends your domain automatically.',
};

export function getDnsRecordPurpose(record = {}) {
  const type = String(record.type || '').toUpperCase();
  const name = String(record.name || '').toLowerCase();
  const value = String(record.value || '').toLowerCase();
  if (name.includes('_domainkey') || value.includes('dkim')) return { title: 'DKIM authentication', description: 'Signs outgoing mail so recipients can verify it came from your domain.' };
  if (name.includes('_dmarc')) return { title: 'DMARC policy', description: 'Tells receiving mail systems how to handle messages that fail authentication.' };
  if (value.includes('v=spf1')) return { title: 'SPF authorization', description: 'Authorizes the sending service to send mail for this subdomain.' };
  if (type === 'MX') return { title: 'Return-path routing', description: 'Routes delivery reports and supports sending-domain alignment.' };
  return { title: 'Domain verification', description: 'Proves control of the domain to the sending service.' };
}

export function getDnsRecordStatus(record = {}) {
  const status = String(record.status || 'pending').toLowerCase();
  if (['verified', 'valid', 'active'].includes(status)) return { label: 'Verified', tone: 'bg-emerald-100 text-emerald-700' };
  if (['failed', 'invalid', 'error'].includes(status)) return { label: 'Needs attention', tone: 'bg-red-100 text-red-700' };
  return { label: 'Pending', tone: 'bg-amber-100 text-amber-700' };
}
