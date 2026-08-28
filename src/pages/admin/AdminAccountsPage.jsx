import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchInput from '../../components/ui/SearchInput';
import FilterSelect from '../../components/ui/FilterSelect';
import Pagination from '../../components/ui/Pagination';
import { matchesSearch } from '../../lib/search';
import { usePagination } from '../../lib/usePagination';

// 'invited' (admin created this account and the owner hasn't set a
// password yet) and 'awaiting_approval' (a public self-signup nobody's
// reviewed yet — see schema.prisma's Account.approvedAt) are mutually
// exclusive in practice: every admin-created account is auto-approved at
// creation (see admin.js's createInvitedUser), so only a cold self-signup
// can ever be unapproved, and self-signup always sets a password
// immediately. Still checked in a sensible order regardless.
function accountStatus(a) {
  if (a.disabledAt) return 'disabled';
  if (!a.approvedAt) return 'awaiting_approval';
  if (a.owner && !a.owner.hasPassword) return 'invited';
  return 'active';
}

// Keep in sync with server/src/lib/verticals.js's VERTICALS list.
const VERTICAL_LABELS = { band_orchestra: 'Band & Orchestra', party_planning: 'Event and Party Planning', photography: 'Photography' };
const VERTICAL_OPTIONS = Object.entries(VERTICAL_LABELS).map(([value, label]) => ({ value, label }));

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

export default function AdminAccountsPage() {
  const { currentUser } = useAuth();
  const canManageStatus = currentUser?.isPlatformOwner || currentUser?.adminPermissions?.manageAccountStatus;
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [disableTarget, setDisableTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [teamSizeFilter, setTeamSizeFilter] = useState('');

  function load() {
    apiFetch('/admin/accounts')
      .then((data) => setAccounts(data.accounts))
      .catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);

  async function handleApprove(account) {
    try {
      const data = await apiFetch(`/admin/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ approved: true }),
      });
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, approvedAt: data.approvedAt, approvedBy: data.approvedBy } : a)));
      showToast('Account approved');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleReEnable() {
    const account = disableTarget;
    try {
      const data = await apiFetch(`/admin/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ disabled: false }),
      });
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, disabledAt: data.disabledAt, disabledReason: data.disabledReason, disabledBy: data.disabledBy } : a)));
      showToast('Account re-enabled');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDisableTarget(null);
    }
  }

  async function handleVerticalChange(account, vertical) {
    try {
      const data = await apiFetch(`/admin/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ vertical }),
      });
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, vertical: data.vertical } : a)));
      showToast('Business type updated');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleToggleAllVerticals(account) {
    try {
      const data = await apiFetch(`/admin/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ allVerticalsEnabled: !account.allVerticalsEnabled }),
      });
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, allVerticalsEnabled: data.allVerticalsEnabled } : a)));
      showToast(data.allVerticalsEnabled ? 'All verticals enabled' : 'All verticals disabled');
    } catch (err) {
      showToast(err.message, 'error');
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

  function teamSizeBucket(a) {
    if (a.memberCount <= 1) return 'solo';
    if (a.memberCount <= 5) return 'small';
    return 'large';
  }

  const hasFilters = !!(search || statusFilter || teamSizeFilter);
  const filteredAccounts = (accounts || []).filter((a) => {
    if (statusFilter && accountStatus(a) !== statusFilter) return false;
    if (teamSizeFilter && teamSizeBucket(a) !== teamSizeFilter) return false;
    return matchesSearch(search, [a.owner?.firstName, a.owner?.lastName, a.owner?.email]);
  });
  // Called unconditionally (before the loading/error early returns below) —
  // React Hooks can't be called conditionally.
  const { page, setPage, pageCount, pageItems: pagedAccounts, pageSize, totalItems } = usePagination(filteredAccounts);

  if (loadError) return <div data-testid="admin-accounts-load-error-banner" className="text-sm text-red-600">{loadError}</div>;
  if (!accounts) return <div className="text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Accounts</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          data-testid="admin-accounts-add-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          + New Account
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by owner name or email…" className="w-72" testId="admin-accounts-search-input" />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          allLabel="All Statuses"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'awaiting_approval', label: 'Needs Approval' },
            { value: 'invited', label: 'Invited' },
            { value: 'disabled', label: 'Disabled' },
          ]}
          testId="admin-accounts-status-filter"
        />
        <FilterSelect
          value={teamSizeFilter}
          onChange={setTeamSizeFilter}
          allLabel="All Team Sizes"
          options={[
            { value: 'solo', label: 'Solo (1)' },
            { value: 'small', label: 'Small (2–5)' },
            { value: 'large', label: 'Large (6+)' },
          ]}
          testId="admin-accounts-team-size-filter"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter(''); setTeamSizeFilter(''); }}
            data-testid="admin-accounts-clear-filters-button"
            className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Owner</th>
              <th className="hidden sm:table-cell px-4 py-3">Members</th>
              <th className="hidden md:table-cell px-4 py-3">Plan</th>
              <th className="hidden lg:table-cell px-4 py-3">Signup</th>
              <th className="hidden sm:table-cell px-4 py-3">Vertical</th>
              <th className="hidden md:table-cell px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  {accounts.length === 0 ? 'No accounts yet.' : 'No accounts match your search or filters.'}
                </td>
              </tr>
            )}
            {pagedAccounts.map((a) => (
              <tr key={a.id} data-testid="admin-account-row" className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/admin/accounts/${a.id}`} className="font-medium text-slate-800 hover:text-indigo-700 hover:underline">{a.owner ? `${a.owner.firstName} ${a.owner.lastName}` : '—'}</Link>
                  <div className="text-slate-500 text-xs">{a.owner?.email}</div>
                </td>
                <td className="hidden sm:table-cell px-4 py-3 text-slate-600">{a.memberCount}</td>
                <td className="hidden md:table-cell px-4 py-3 text-slate-500 text-xs">
                  <div className="font-semibold text-slate-700 capitalize">{a.planTier || a.signupPlan || 'No plan'}</div>
                  <div>{(a.billingInterval || a.signupInterval) === 'year' ? 'Annual' : (a.billingInterval || a.signupInterval) === 'month' ? 'Monthly' : 'Not selected'}</div>
                  {a.subscriptionStatus && <div className="capitalize text-indigo-600">{a.subscriptionStatus}</div>}
                </td>
                <td className="hidden lg:table-cell px-4 py-3 text-slate-500 text-xs">
                  <div className="capitalize">{a.signupSource === 'public' ? 'Website' : 'Admin'}</div>
                  <div>{new Date(a.createdAt).toLocaleDateString()}</div>
                </td>
                <td className="hidden sm:table-cell px-4 py-3 text-slate-500 text-xs">
                  {canManageStatus ? (
                    <select
                      value={a.vertical}
                      onChange={(e) => handleVerticalChange(a, e.target.value)}
                      data-testid="admin-account-row-vertical-select"
                      className="px-1.5 py-1 rounded border border-slate-200 text-xs bg-white"
                    >
                      {VERTICAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div>{VERTICAL_LABELS[a.vertical] || a.vertical}</div>
                  )}
                  {a.allVerticalsEnabled && <div className="text-indigo-600 font-semibold mt-0.5">+ all verticals</div>}
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-slate-500 text-xs">{new Date(a.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {a.disabledAt ? (
                    <div>
                      <span className="text-xs font-semibold text-red-600">Disabled</span>
                      <div className="text-[11px] text-slate-400 mt-0.5 max-w-[180px]">
                        {a.disabledReason}
                        {a.disabledBy && ` — ${a.disabledBy.firstName} ${a.disabledBy.lastName}`}
                        <br />
                        {new Date(a.disabledAt).toLocaleDateString()}
                      </div>
                    </div>
                  ) : !a.approvedAt ? (
                    <span data-testid="admin-account-row-status-awaiting-approval" className="text-xs font-semibold text-amber-600">Needs Approval</span>
                  ) : a.owner && !a.owner.hasPassword ? (
                    <span className="text-xs font-semibold text-slate-500">Invited</span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-600">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  <Link to={`/admin/accounts/${a.id}`} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Profile</Link>
                  {canManageStatus && (
                    <>
                      {!a.approvedAt && !a.disabledAt && (
                        <button
                          type="button"
                          onClick={() => handleApprove(a)}
                          data-testid="admin-account-row-approve-button"
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          Approve
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDisableTarget(a)}
                        data-testid="admin-account-row-toggle-disabled-button"
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      >
                        {a.disabledAt ? 'Enable' : 'Disable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleAllVerticals(a)}
                        data-testid="admin-account-row-toggle-all-verticals-button"
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      >
                        {a.allVerticalsEnabled ? 'Restrict to 1 Vertical' : 'Enable All Verticals'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(a)}
                        data-testid="admin-account-row-delete-button"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                        aria-label="Delete account"
                      >
                        🗑
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} testId="admin-accounts-pagination" />
      </div>

      <NewAccountModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); load(); }} />

      {disableTarget && !disableTarget.disabledAt ? (
        <DisableAccountModal
          account={disableTarget}
          onClose={() => setDisableTarget(null)}
          onDisabled={(updated) => {
            setAccounts((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
            setDisableTarget(null);
          }}
        />
      ) : (
        <ConfirmDialog
          open={!!disableTarget?.disabledAt}
          onClose={() => setDisableTarget(null)}
          onConfirm={handleReEnable}
          title="Re-enable account?"
          description="This restores access for every member of this account."
          confirmLabel="Enable"
        />
      )}

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

function DisableAccountModal({ account, onClose, onDisabled }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (account) {
      setReason('');
      setError('');
    }
  }, [account]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    setError('');
    setSaving(true);
    try {
      const data = await apiFetch(`/admin/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ disabled: true, reason: reason.trim() }),
      });
      showToast('Account disabled');
      onDisabled({ id: account.id, disabledAt: data.disabledAt, disabledReason: data.disabledReason, disabledBy: data.disabledBy });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!account} onClose={onClose} title="Disable Account">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div data-testid="admin-accounts-disable-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <p className="text-sm text-slate-600">This immediately blocks every member of this account from signing in or using the app.</p>
        <div>
          <label className={labelClass}>Reason</label>
          <textarea
            required
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Non-payment, terms violation, customer request"
            data-testid="admin-accounts-disable-reason-textarea"
            className={inputClass}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="admin-accounts-disable-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving || !reason.trim()} data-testid="admin-accounts-disable-confirm-button" className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
            {saving ? 'Disabling…' : 'Disable Account'}
          </button>
        </div>
      </form>
    </Modal>
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
        {error && <div data-testid="admin-accounts-new-account-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>First Name</label>
            <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} data-testid="admin-accounts-new-account-firstname-input" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Last Name</label>
            <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} data-testid="admin-accounts-new-account-lastname-input" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Email</label>
          <input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} data-testid="admin-accounts-new-account-email-input" className={inputClass} />
          <p className="mt-1 text-xs text-slate-400">They'll get an email with a link to set their own password.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="admin-accounts-new-account-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving} data-testid="admin-accounts-new-account-submit-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
