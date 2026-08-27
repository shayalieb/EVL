import { useEffect, useState } from 'react';
import { apiFetch } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchInput from '../../components/ui/SearchInput';
import FilterSelect from '../../components/ui/FilterSelect';
import { matchesSearch } from '../../lib/search';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Scoped platform-admin capabilities — keep in sync with ADMIN_PERMISSION_KEYS
// in server/src/routes/admin.js.
const PERMISSION_OPTIONS = [
  { key: 'manageAccounts', label: 'Manage Accounts', hint: 'View, search, and invite/create accounts' },
  { key: 'manageAccountStatus', label: 'Enable/Disable Accounts', hint: 'Disable, re-enable, or delete an account' },
  { key: 'manageSupport', label: 'Helpdesk', hint: 'View and reply to support threads' },
  { key: 'manageAdmins', label: 'Manage Admins', hint: 'Grant, edit, or revoke other admins’ access' },
  { key: 'manageWebsite', label: 'Website', hint: 'Edit public website content, pricing presentation, and launch state' },
];

function PermissionCheckboxes({ value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Permissions</label>
      <div className="space-y-2 border border-slate-200 rounded-lg p-3">
        {PERMISSION_OPTIONS.map((opt) => (
          <label key={opt.key} className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!value[opt.key]}
              onChange={(e) => onChange({ ...value, [opt.key]: e.target.checked })}
              data-testid={`admin-admins-permission-${opt.key}-checkbox`}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-700">{opt.label}</span>
              <span className="block text-xs text-slate-400">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PermissionBadges({ admin }) {
  if (admin.isPlatformOwner) return <span className="text-xs font-semibold text-indigo-600">Owner (full access)</span>;
  const granted = PERMISSION_OPTIONS.filter((opt) => admin.adminPermissions?.[opt.key]);
  if (granted.length === 0) return <span className="text-xs text-slate-400">No permissions granted</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {granted.map((opt) => (
        <span key={opt.key} className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
          {opt.label}
        </span>
      ))}
    </div>
  );
}

export default function AdminAdminsPage() {
  const { showToast } = useToast();
  const [admins, setAdmins] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [grantOpen, setGrantOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  function load() {
    apiFetch('/admin/platform-admins')
      .then((data) => setAdmins(data.admins))
      .catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);

  async function handleRevoke() {
    try {
      await apiFetch(`/admin/platform-admins/${revokeTarget.id}`, { method: 'DELETE' });
      setAdmins((prev) => prev.filter((a) => a.id !== revokeTarget.id));
      showToast('Admin access removed');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRevokeTarget(null);
    }
  }

  if (loadError) return <div data-testid="admin-admins-load-error-banner" className="text-sm text-red-600">{loadError}</div>;
  if (!admins) return <div className="text-sm text-slate-400">Loading…</div>;

  const hasFilters = !!(search || roleFilter);
  const filteredAdmins = admins.filter((a) => {
    if (roleFilter && (a.isPlatformOwner ? 'owner' : 'admin') !== roleFilter) return false;
    return matchesSearch(search, [a.firstName, a.lastName, a.email]);
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Admins</h2>
          <p className="text-sm text-slate-500 mt-1">
            People who can access this Admin area. This isn't a self-serve feature — only existing admins can grant it.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setGrantOpen(true)}
            data-testid="admin-admins-grant-access-button"
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Grant to Existing Account
          </button>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            data-testid="admin-admins-invite-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
          >
            + Invite New Admin
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or email…" className="w-72" testId="admin-admins-search-input" />
        <FilterSelect
          value={roleFilter}
          onChange={setRoleFilter}
          allLabel="All Roles"
          options={[
            { value: 'owner', label: 'Owner' },
            { value: 'admin', label: 'Admin' },
          ]}
          testId="admin-admins-role-filter"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setRoleFilter(''); }}
            data-testid="admin-admins-clear-filters-button"
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
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Permissions</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAdmins.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  {admins.length === 0 ? 'No admins yet.' : 'No admins match your search or filters.'}
                </td>
              </tr>
            )}
            {filteredAdmins.map((a) => (
              <tr key={a.id} data-testid="admin-admin-row" className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-800">{a.firstName} {a.lastName}</td>
                <td className="px-4 py-3 text-slate-500">{a.email}</td>
                <td className="px-4 py-3">
                  <PermissionBadges admin={a} />
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                  {!a.isPlatformOwner && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditTarget(a)}
                        data-testid="admin-admin-row-edit-button"
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-1.5 py-1"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevokeTarget(a)}
                        data-testid="admin-admin-row-revoke-button"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                        aria-label={`Remove admin access for ${a.firstName}`}
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

      <GrantAccessModal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        onGranted={(admin) => {
          setAdmins((prev) => [...prev, admin]);
          setGrantOpen(false);
        }}
      />

      <InviteAdminModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(admin) => {
          setAdmins((prev) => [...prev, admin]);
          setInviteOpen(false);
        }}
      />

      <EditPermissionsModal
        admin={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={(admin) => {
          setAdmins((prev) => prev.map((a) => (a.id === admin.id ? admin : a)));
          setEditTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Remove admin access?"
        description={`${revokeTarget?.firstName} ${revokeTarget?.lastName} will no longer be able to access the Admin area. Their regular account is unaffected.`}
        confirmLabel="Remove"
      />
    </div>
  );
}

function GrantAccessModal({ open, onClose, onGranted }) {
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail('');
      setPermissions({});
      setError('');
    }
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = await apiFetch('/admin/platform-admins', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), permissions }),
      });
      onGranted(data.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Grant Admin Access">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div data-testid="admin-admins-grant-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="admin-admins-grant-email-input" className={inputClass} />
          <p className="mt-1 text-xs text-slate-400">Must already have an account — use "Invite New Admin" instead if they don't.</p>
        </div>
        <PermissionCheckboxes value={permissions} onChange={setPermissions} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="admin-admins-grant-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving} data-testid="admin-admins-grant-submit-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Granting…' : 'Grant Access'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InviteAdminModal({ open, onClose, onInvited }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const [permissions, setPermissions] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ firstName: '', lastName: '', email: '' });
      setPermissions({});
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
      const data = await apiFetch('/admin/platform-admins/invite', {
        method: 'POST',
        body: JSON.stringify({ ...form, email: form.email.trim().toLowerCase(), permissions }),
      });
      onInvited(data.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite New Admin">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div data-testid="admin-admins-invite-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">First Name</label>
            <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} data-testid="admin-admins-invite-firstname-input" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Last Name</label>
            <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} data-testid="admin-admins-invite-lastname-input" className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
          <input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} data-testid="admin-admins-invite-email-input" className={inputClass} />
          <p className="mt-1 text-xs text-slate-400">Creates a new account with admin access already on, and emails them a link to set their password.</p>
        </div>

        <PermissionCheckboxes value={permissions} onChange={setPermissions} />

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="admin-admins-invite-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving} data-testid="admin-admins-invite-submit-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditPermissionsModal({ admin, onClose, onUpdated }) {
  const [permissions, setPermissions] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (admin) {
      setPermissions(admin.adminPermissions || {});
      setError('');
    }
  }, [admin]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = await apiFetch(`/admin/platform-admins/${admin.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions }),
      });
      onUpdated(data.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!admin} onClose={onClose} title={`Edit Permissions${admin ? ` — ${admin.firstName} ${admin.lastName}` : ''}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div data-testid="admin-admins-edit-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <PermissionCheckboxes value={permissions} onChange={setPermissions} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="admin-admins-edit-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving} data-testid="admin-admins-edit-submit-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
