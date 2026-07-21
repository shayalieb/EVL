import { useEffect, useState } from 'react';
import { apiFetch } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export default function AdminAdminsPage() {
  const { showToast } = useToast();
  const [admins, setAdmins] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [grantOpen, setGrantOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

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

  if (loadError) return <div className="text-sm text-red-600">{loadError}</div>;
  if (!admins) return <div className="text-sm text-slate-400">Loading…</div>;

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
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Grant to Existing Account
          </button>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
          >
            + Invite New Admin
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-800">{a.firstName} {a.lastName}</td>
                <td className="px-4 py-3 text-slate-500">{a.email}</td>
                <td className="px-4 py-3">
                  {a.isPlatformOwner ? (
                    <span className="text-xs font-semibold text-indigo-600">Owner</span>
                  ) : (
                    <span className="text-xs text-slate-500">Admin</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!a.isPlatformOwner && (
                    <button
                      type="button"
                      onClick={() => setRevokeTarget(a)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                      aria-label={`Remove admin access for ${a.firstName}`}
                    >
                      🗑
                    </button>
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
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail('');
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
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
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
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-slate-400">Must already have an account — use "Invite New Admin" instead if they don't.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Granting…' : 'Grant Access'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InviteAdminModal({ open, onClose, onInvited }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
      const data = await apiFetch('/admin/platform-admins/invite', {
        method: 'POST',
        body: JSON.stringify({ ...form, email: form.email.trim().toLowerCase() }),
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
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">First Name</label>
            <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Last Name</label>
            <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
          <input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-slate-400">Creates a new account with admin access already on, and emails them a link to set their password.</p>
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
