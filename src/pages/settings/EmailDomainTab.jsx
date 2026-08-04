import { useEffect, useState } from 'react';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { getEmailDomain, createEmailDomain, createCustomEmailDomain, verifyEmailDomain } from '../../lib/emailDomains';

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

  async function handleCopy(value) {
    try {
      await navigator.clipboard.writeText(value);
      showToast('Copied');
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  }

  if (loadError) return <div data-testid="settings-email-domain-error-banner" className="text-sm text-red-600">{loadError}</div>;

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
                <label className="block text-xs font-semibold text-slate-500 mb-1">Your domain</label>
                <input
                  required
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="mail.yourcompany.com"
                  data-testid="settings-email-domain-customdomain-input"
                  className={`${inputClass} max-w-[16rem]`}
                />
                <p className="text-xs text-slate-400 mt-1.5">
                  We don't control this domain's DNS, so you'll need to add a few records yourself wherever it's registered — we'll show you exactly what to add next.
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
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Domain</div>
              <div className="text-sm font-mono text-slate-700">{domain.domain}</div>
            </div>
            <Badge color={STATUS_COLOR[domain.status] || '#94a3b8'}>
              <span data-testid="settings-email-domain-status-badge">{STATUS_LABEL[domain.status] || domain.status}</span>
            </Badge>
          </div>

          {domain.status !== 'verified' && (
            <>
              <p className="text-xs text-slate-400">
                {domain.isCustomDomain
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

          {Array.isArray(domain.dnsRecords) && domain.dnsRecords.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                DNS Records {domain.isCustomDomain && '— add these yourself'}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="pr-3 py-1">Type</th>
                      <th className="pr-3 py-1">Name</th>
                      <th className="pr-3 py-1">Value</th>
                      <th className="py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domain.dnsRecords.map((r, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="pr-3 py-1.5 font-mono align-top">{r.type}</td>
                        <td className="pr-3 py-1.5 font-mono text-slate-500 align-top">{r.name}</td>
                        <td className="pr-3 py-1.5 align-top">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-slate-500 break-all">{r.value}</span>
                            {domain.isCustomDomain && (
                              <button
                                type="button"
                                onClick={() => handleCopy(r.value)}
                                data-testid="settings-email-domain-copy-record-button"
                                className="shrink-0 text-slate-400 hover:text-indigo-600"
                                aria-label="Copy value"
                              >
                                ⧉
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 text-slate-500 align-top">{r.status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
