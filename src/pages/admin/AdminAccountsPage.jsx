import { useEffect, useState } from 'react';
import { apiFetch } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchInput from '../../components/ui/SearchInput';
import FilterSelect from '../../components/ui/FilterSelect';
import { matchesSearch } from '../../lib/search';

function accountStatus(a) {
  if (a.disabledAt) return 'disabled';
  if (a.owner && !a.owner.hasPassword) return 'pending';
  return 'active';
}

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

export default function AdminAccountsPage() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [disableTarget, setDisableTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  function load() {
    apiFetch('/admin/accounts')
      .then((data) => setAccounts(data.accounts))
      .catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);

  async function handleToggleDisabled() {
    const account = disableTarget;
    const nextDisabled = !account.disabledAt;
    try {
      const data = await apiFetch(`/admin/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ disabled: nextDisabled }),
      });
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, disabledAt: data.disabledAt } : a)));
      showToast(nextDisabled ? 'Account disabled' : 'Account re-enabled');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDisableTarget(null);
    }
  }

  async function handleDelete() {
    try {
      await apiFetch(`/admin/accounts/${deleteTarget.id}`, { method: 'DELETE' });
      setAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      showToast('Account deleted');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleteTarget(null);
    }
  }

  if (loadError) return <div className="text-sm text-red-600">{loadError}</div>;
  if (!accounts) return <div className="text-sm text-slate-400">Loading…</div>;

  const hasFilters = !!(search || statusFilter);
  const filteredAccounts = accounts.filter((a) => {
    if (statusFilter && accountStatus(a) !== statusFilter) return false;
    return matchesSearch(search, [a.owner?.firstName, a.owner?.lastName, a.owner?.email]);
  });

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Accounts</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          + New Account
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by owner name or email…" className="w-72" />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          allLabel="All Statuses"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'pending', label: 'Pending' },
            { value: 'disabled', label: 'Disabled' },
          ]}
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter(''); }}
            className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  {accounts.length === 0 ? 'No accounts yet.' : 'No accounts match your search or filters.'}
                </td>
              </tr>
            )}
            {filteredAccounts.map((a) => (
              <tr key={a.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{a.owner ? `${a.owner.firstName} ${a.owner.lastName}` : '—'}</div>
                  <div className="text-slate-500 text-xs">{a.owner?.email}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{a.memberCount}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {a.dataSummary.contractors} contractors · {a.dataSummary.clients} clients · {a.dataSummary.events} events
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{new Date(a.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {a.disabledAt ? (
                    <span className="text-xs font-semibold text-red-600">Disabled</span>
                  ) : a.owner && !a.owner.hasPassword ? (
                    <span className="text-xs font-semibold text-amber-600">Pending</span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-600">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setDisableTarget(a)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    {a.disabledAt ? 'Enable' : 'Disable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(a)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Delete account"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewAccountModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); load(); }} />

      <ConfirmDialog
        open={!!disableTarget}
        onClose={() => setDisableTarget(null)}
        onConfirm={handleToggleDisabled}
        title={disableTarget?.disabledAt ? 'Re-enable account?' : 'Disable account?'}
        description={
          disableTarget?.disabledAt
            ? 'This restores access for every member of this account.'
            : 'This immediately blocks every member of this account from signing in or using the app.'
        }
        confirmLabel={disableTarget?.disabledAt ? 'Enable' : 'Disable'}
        danger={!disableTarget?.disabledAt}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete account?"
        description="This permanently deletes all contractors, clients, events, bookings, and support history for this account. This can't be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}

function NewAccountModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setForm({ firstName: '', lastName: '', email: '' });
      setError('');
    }
  }, [open]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch('/admin/accounts', {
        method: 'POST',
        body: JSON.stringify({ ...form, email: form.email.trim().toLowerCase() }),
      });
      showToast('Invite sent');
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Account">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>First Name</label>
            <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Last Name</label>
            <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Email</label>
          <input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-slate-400">They'll get an email with a link to set their own password.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
