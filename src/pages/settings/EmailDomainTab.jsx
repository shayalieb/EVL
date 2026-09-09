import { useEffect, useState } from 'react';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { getEmailDomain, createEmailDomain, createCustomEmailDomain, verifyEmailDomain, replaceEmailDomain, cancelEmailDomainReplacement, removeEmailDomain, sendEmailDomainTest } from '../../lib/emailDomains';
import { DNS_PROVIDERS, DNS_PROVIDER_GUIDANCE, getDnsRecordPurpose, getDnsRecordStatus } from '../../lib/emailDomainDns';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const STATUS_LABEL = { pending: 'Pending Verification', verified: 'Verified', failed: 'Failed' };
const STATUS_COLOR = { pending: '#eab308', verified: '#22c55e', failed: '#ef4444' };

export default function EmailDomainTab() {
  const { showToast } = useToast();
  const [domain, setDomain] = useState(null);
  const [rootDomain, setRootDomain] = useState('gigworks.io');
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState('subdomain'); // 'subdomain' | 'custom'
  const [subdomain, setSubdomain] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dnsProvider, setDnsProvider] = useState('other');
  const [changing, setChanging] = useState(false);
  const [replacementDomain, setReplacementDomain] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  function load() {
    getEmailDomain()
      .then(({ domain: d, rootDomain: rd }) => { setDomain(d); setRootDomain(rd); })
      .catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);

  async function handleCreateSubdomain(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await createEmailDomain(subdomain);
      setDomain(created);
      showToast('Email domain requested — verifying now');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateCustom(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await createCustomEmailDomain(customDomain);
      setDomain(created);
      showToast('Domain registered — add the DNS records below to verify it');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleCheckStatus() {
    setChecking(true);
    try {
      const updated = await verifyEmailDomain();
      setDomain(updated);
      showToast(updated.status === 'verified' ? 'Domain verified!' : `Status: ${STATUS_LABEL[updated.status] || updated.status}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setChecking(false);
    }
  }

  async function handleReplacement(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const updated = await replaceEmailDomain(replacementDomain);
      setDomain(updated);
      setChanging(false);
      setReplacementDomain('');
      showToast('Replacement registered — your current verified domain remains active');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleCancelReplacement() {
    setCreating(true);
    try {
      setDomain(await cancelEmailDomainReplacement());
      showToast('Replacement canceled — your active domain was not changed');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleRemoveDomain() {
    if (!window.confirm('Remove this branded email domain? GigWorks will immediately return to its shared sending address.')) return;
    setCreating(true);
    try {
      await removeEmailDomain();
      setDomain(null);
      setChanging(false);
      showToast('Email domain removed');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleTestEmail(e) {
    e.preventDefault();
    setTesting(true);
    try {
      await sendEmailDomainTest(testEmail);
      showToast('Test email sent — reply to it to confirm reply tracking');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  }

  async function handleCopy(value) {
    try {
      await navigator.clipboard.writeText(value);
      showToast('Copied');
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  }

  if (loadError) return <div data-testid="settings-email-domain-error-banner" className="text-sm text-red-600">{loadError}</div>;
  const hasPendingReplacement = !!domain?.pendingDomain;
  const setupDomain = hasPendingReplacement ? {
    ...domain,
    domain: domain.pendingDomain,
    isCustomDomain: domain.pendingIsCustomDomain,
    status: domain.pendingStatus || 'pending',
    dnsRecords: domain.pendingDnsRecords || [],
    sendingStatus: domain.pendingSendingStatus || 'pending',
    receivingStatus: domain.pendingReceivingStatus || 'pending',
  } : domain;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-1">Email Domain</h3>
        <p className="text-sm text-slate-500">
          Send contracts, invoices, inquiries, reminders, and contractor emails from your own address instead of the shared default — either a subdomain we set up for you, or a domain you already own.
        </p>
      </div>

      {!domain ? (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold w-fit">
            <button
              type="button"
              onClick={() => setMode('subdomain')}
              data-testid="settings-email-domain-mode-subdomain-button"
              className={`px-3 py-1.5 ${mode === 'subdomain' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {rootDomain} subdomain
            </button>
            <button
              type="button"
              onClick={() => setMode('custom')}
              data-testid="settings-email-domain-mode-custom-button"
              className={`px-3 py-1.5 ${mode === 'custom' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Use your own domain
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <CapabilityStatus title="Sending" status={setupDomain.sendingStatus || setupDomain.status} readyText="Authenticated and ready" pendingText="SPF or DKIM still pending" />
            <CapabilityStatus title="Reply tracking" status={setupDomain.receivingStatus} readyText="Inbound replies can be tracked" pendingText="Inbound routing is not ready" />
          </div>
          {domain.lastHealthCheckedAt && <p className="text-[11px] text-slate-400">DNS health last checked {new Date(domain.lastHealthCheckedAt).toLocaleString()}.</p>}

          {(domain.sendingStatus === 'verified' || domain.status === 'verified') && (
            <form onSubmit={handleTestEmail} className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <label className="block text-xs font-semibold text-emerald-800">Send a test from {domain.domain}</label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input type="email" required value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="you@example.com" className={`${inputClass} max-w-sm bg-white`} />
                <button type="submit" disabled={testing} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{testing ? 'Sending…' : 'Send test email'}</button>
              </div>
              <p className="mt-2 text-xs text-emerald-700">After it arrives, reply to confirm the conversation returns to Contact History.</p>
            </form>
          )}

          {mode === 'subdomain' ? (
            <form onSubmit={handleCreateSubdomain} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Choose a subdomain</label>
                <div className="flex items-center gap-2">
                  <input
                    required
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    placeholder="acme"
                    data-testid="settings-email-domain-subdomain-input"
                    className={`${inputClass} max-w-[10rem]`}
                  />
                  <span className="text-sm text-slate-400">.{rootDomain}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">DNS records are set up automatically — no need to touch anything yourself.</p>
              </div>
              <button
                type="submit"
                disabled={creating}
                data-testid="settings-email-domain-create-button"
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? 'Setting up…' : 'Set Up Email Domain'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreateCustom} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Sending subdomain</label>
                <input
                  required
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="mail.yourcompany.com"
                  data-testid="settings-email-domain-customdomain-input"
                  className={`${inputClass} max-w-[16rem]`}
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Recommended: use <span className="font-mono">mail.yourcompany.com</span> rather than your main domain. This keeps GigWorks sending separate from your website and existing inboxes.
                </p>
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  You will add records, not replace them. Never delete existing website, Google Workspace, Microsoft 365, or other email records.
                </p>
              </div>
              <button
                type="submit"
                disabled={creating}
                data-testid="settings-email-domain-create-custom-button"
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? 'Registering…' : 'Register Domain'}
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{hasPendingReplacement ? 'Replacement being verified' : 'Domain'}</div>
              <div className="text-sm font-mono text-slate-700">{setupDomain.domain}</div>
              {hasPendingReplacement && <div className="mt-1 text-xs text-emerald-700">Current sending remains active on <span className="font-mono">{domain.domain}</span></div>}
            </div>
            <Badge color={STATUS_COLOR[setupDomain.status] || '#94a3b8'}>
              <span data-testid="settings-email-domain-status-badge">{STATUS_LABEL[setupDomain.status] || setupDomain.status}</span>
            </Badge>
          </div>

          {setupDomain.status !== 'verified' && (
            <>
              <p className="text-xs text-slate-400">
                {setupDomain.isCustomDomain
                  ? 'Add the DNS records below at your domain\'s DNS provider, then check status — propagation can take a few minutes to a few hours.'
                  : 'DNS propagation can take a few minutes to a few hours. Check back or click below to force a recheck.'}
              </p>
              <button
                type="button"
                onClick={handleCheckStatus}
                disabled={checking}
                data-testid="settings-email-domain-check-status-button"
                className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50 disabled:opacity-50"
              >
                {checking ? 'Checking…' : 'Check Status'}
              </button>
            </>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {!hasPendingReplacement && !changing && <button type="button" onClick={() => setChanging(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Change domain</button>}
            {hasPendingReplacement && <button type="button" onClick={handleCancelReplacement} disabled={creating} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel replacement</button>}
            <button type="button" onClick={handleRemoveDomain} disabled={creating} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Remove domain</button>
          </div>

          {changing && (
            <form onSubmit={handleReplacement} className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <label className="block text-xs font-semibold text-indigo-800">New sending subdomain</label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input required value={replacementDomain} onChange={(event) => setReplacementDomain(event.target.value)} placeholder="mail.yourcompany.com" className={`${inputClass} max-w-sm bg-white`} />
                <button type="submit" disabled={creating} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{creating ? 'Registering…' : 'Start replacement'}</button>
                <button type="button" onClick={() => setChanging(false)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600">Cancel</button>
              </div>
              <p className="mt-2 text-xs text-indigo-700">Your current verified domain stays active until this replacement passes verification.</p>
            </form>
          )}

          {Array.isArray(setupDomain.dnsRecords) && setupDomain.dnsRecords.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">DNS Records {setupDomain.isCustomDomain && '— add these yourself'}</div>
                  <p className="mt-1 text-xs text-slate-500">{setupDomain.dnsRecords.length} record{setupDomain.dnsRecords.length === 1 ? '' : 's'} required. Add every record before checking status.</p>
                </div>
                {setupDomain.isCustomDomain && (
                  <label className="text-xs font-semibold text-slate-500">
                    DNS provider
                    <select value={dnsProvider} onChange={(event) => setDnsProvider(event.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-normal text-slate-700">
                      {DNS_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {setupDomain.isCustomDomain && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-800">
                  <strong>{DNS_PROVIDERS.find((provider) => provider.id === dnsProvider)?.label}:</strong> {DNS_PROVIDER_GUIDANCE[dnsProvider]}
                </div>
              )}
              {setupDomain.isCustomDomain && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Add these alongside your existing records. Do not remove or edit records used by your website or current email provider. If your DNS editor shows the domain twice in its preview, enter only the host portion it expects.
                </div>
              )}
              <div className="space-y-3">
                {setupDomain.dnsRecords.map((record, index) => {
                  const purpose = getDnsRecordPurpose(record);
                  const recordStatus = getDnsRecordStatus(record);
                  return (
                    <section key={`${record.type}-${record.name}-${index}`} className="rounded-xl border border-slate-200 p-4" data-testid="settings-email-domain-record-card">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-bold text-slate-700">{purpose.title}</h4>
                          <p className="mt-0.5 text-xs text-slate-500">{purpose.description}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${recordStatus.tone}`}>{recordStatus.label}</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <DnsValue label="Type" value={record.type} />
                        <DnsValue label="Host / name" value={record.name} onCopy={setupDomain.isCustomDomain ? handleCopy : null} testId="settings-email-domain-copy-name-button" />
                        <div className="sm:col-span-2">
                          <DnsValue label="Value / destination" value={record.value} onCopy={setupDomain.isCustomDomain ? handleCopy : null} testId="settings-email-domain-copy-record-button" />
                        </div>
                        <DnsValue label="TTL" value={record.ttl ? `${record.ttl} seconds` : 'Automatic or provider default'} />
                        {record.priority !== undefined && record.priority !== null && <DnsValue label="Priority" value={record.priority} />}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DnsValue({ label, value, onCopy, testId }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="flex min-h-9 items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
        <span className="break-all font-mono text-xs text-slate-600">{String(value ?? '—')}</span>
        {onCopy && (
          <button type="button" onClick={() => onCopy(String(value ?? ''))} data-testid={testId} className="shrink-0 rounded px-1.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100" aria-label={`Copy ${label.toLowerCase()}`}>
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

function CapabilityStatus({ title, status, readyText, pendingText }) {
  const ready = status === 'verified';
  const failed = status === 'failed';
  const unavailable = status === 'not_configured';
  return (
    <div className={`rounded-xl border p-3 ${ready ? 'border-emerald-200 bg-emerald-50' : failed ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">{title}</span>
        <span className={`text-[10px] font-bold uppercase ${ready ? 'text-emerald-700' : failed ? 'text-red-700' : 'text-amber-700'}`}>{ready ? 'Ready' : failed ? 'Attention' : 'Pending'}</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{ready ? readyText : unavailable ? 'No inbound reply-routing record was found.' : pendingText}</p>
    </div>
  );
}
