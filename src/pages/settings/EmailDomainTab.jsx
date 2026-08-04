import { useEffect, useState } from 'react';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { getEmailDomain, createEmailDomain, verifyEmailDomain } from '../../lib/emailDomains';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const STATUS_LABEL = { pending: 'Pending Verification', verified: 'Verified', failed: 'Failed' };
const STATUS_COLOR = { pending: '#eab308', verified: '#22c55e', failed: '#ef4444' };

export default function EmailDomainTab() {
  const { showToast } = useToast();
  const [domain, setDomain] = useState(null);
  const [rootDomain, setRootDomain] = useState('gigworks.io');
  const [loadError, setLoadError] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);

  function load() {
    getEmailDomain()
      .then(({ domain: d, rootDomain: rd }) => { setDomain(d); setRootDomain(rd); })
      .catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);

  async function handleCreate(e) {
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

  if (loadError) return <div data-testid="settings-email-domain-error-banner" className="text-sm text-red-600">{loadError}</div>;

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-1">Email Domain</h3>
        <p className="text-sm text-slate-500">
          Send contracts, invoices, inquiries, reminders, and contractor emails from your own subdomain (e.g. <span className="font-mono">yourname@acme.{rootDomain}</span>) instead of the shared default. DNS records are set up automatically — no need to touch your own domain's settings.
        </p>
      </div>

      {!domain ? (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
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
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Domain</div>
              <div className="text-sm font-mono text-slate-700">{domain.subdomain}.{rootDomain}</div>
            </div>
            <Badge color={STATUS_COLOR[domain.status] || '#94a3b8'}>
              <span data-testid="settings-email-domain-status-badge">{STATUS_LABEL[domain.status] || domain.status}</span>
            </Badge>
          </div>

          {domain.status !== 'verified' && (
            <>
              <p className="text-xs text-slate-400">
                DNS propagation can take a few minutes to a few hours. Check back or click below to force a recheck.
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
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">DNS Records</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="pr-3 py-1">Type</th>
                      <th className="pr-3 py-1">Name</th>
                      <th className="py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domain.dnsRecords.map((r, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="pr-3 py-1.5 font-mono">{r.type}</td>
                        <td className="pr-3 py-1.5 font-mono text-slate-500">{r.name}</td>
                        <td className="py-1.5 text-slate-500">{r.status || '—'}</td>
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
