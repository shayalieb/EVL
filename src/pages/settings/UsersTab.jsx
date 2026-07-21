import { useEffect, useState } from 'react';
import { apiFetch, useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

const PERMISSION_FIELDS = [
  { key: 'manageContractors', label: 'Manage Contractors' },
  { key: 'manageClients', label: 'Manage Clients' },
  { key: 'manageBookings', label: 'Manage Bookings' },
  { key: 'manageEvents', label: 'Manage Events' },
  { key: 'manageEmailTemplates', label: 'Manage Email Templates' },
  { key: 'manageOfferings', label: 'Manage Offerings' },
  { key: 'manageSettings', label: 'Manage Business Info & Custom Fields' },
];

function emptyPermissions() {
  return Object.fromEntries(PERMISSION_FIELDS.map((p) => [p.key, false]));
}

export default function UsersTab() {
  const { role: myRole, currentUser } = useAuth();
  const { showToast } = useToast();
  const isOwner = myRole === 'owner';

  const [members, setMembers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  useEffect(() => {
    apiFetch('/team/members')
      .then((data) => setMembers(data.members))
      .catch((err) => setLoadError(err.message));
  }, []);

  async function handleRoleChange(member, newRole) {
    try {
      const data = await apiFetch(`/team/members/${member.id}`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
      setMembers((prev) => prev.map((m) => (m.id === member.id ? data.member : m)));
      showToast(newRole === 'admin' ? 'Promoted to Admin' : 'Demoted to Member');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handlePermissionToggle(member, key, value) {
    try {
      const data = await apiFetch(`/team/members/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: { ...member.permissions, [key]: value } }),
      });
      setMembers((prev) => prev.map((m) => (m.id === member.id ? data.member : m)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleRemove() {
    try {
      await apiFetch(`/team/members/${removeTarget.id}`, { method: 'DELETE' });
      setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id));
      showToast('Member removed');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRemoveTarget(null);
    }
  }

  if (loadError) return <div className="text-sm text-red-600">{loadError}</div>;
  if (!members) return <div className="text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">Team Members</h3>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          + Add Member
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Permissions</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-800">{m.firstName} {m.lastName}</td>
                <td className="px-4 py-3 text-slate-500">{m.email}</td>
                <td className="px-4 py-3">
                  {m.role === 'owner' && <span className="text-xs font-semibold text-indigo-600">Owner</span>}
                  {m.role !== 'owner' && isOwner && (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m, e.target.value)}
                      className="text-xs border border-slate-300 rounded-md px-2 py-1"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  {m.role !== 'owner' && !isOwner && <span className="text-xs text-slate-500 capitalize">{m.role}</span>}
                </td>
                <td className="px-4 py-3">
                  {m.role === 'member' ? (
                    <div className="flex flex-wrap gap-2">
                      {PERMISSION_FIELDS.map((p) => (
                        <label key={p.key} className="flex items-center gap-1 text-xs text-slate-500">
                          <input
                            type="checkbox"
                            checked={!!m.permissions[p.key]}
                            onChange={(e) => handlePermissionToggle(m, p.key, e.target.checked)}
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">All (role-based)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {m.role !== 'owner' && m.userId !== currentUser.id && (m.role !== 'admin' || isOwner) && (
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(m)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                      aria-label={`Remove ${m.firstName}`}
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

      <AddMemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={(member) => {
          setMembers((prev) => [...prev, member]);
          setAddOpen(false);
        }}
      />

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove member?"
        description={`This will remove ${removeTarget?.firstName} ${removeTarget?.lastName}'s access to this account. Their login will remain but they won't see any account data.`}
        confirmLabel="Remove"
      />
    </div>
  );
}

function AddMemberModal({ open, onClose, onAdded }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [permissions, setPermissions] = useState(emptyPermissions());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ firstName: '', lastName: '', email: '', password: '' });
      setPermissions(emptyPermissions());
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
      const data = await apiFetch('/team/members', {
        method: 'POST',
        body: JSON.stringify({ ...form, email: form.email.trim().toLowerCase(), permissions }),
      });
      onAdded(data.member);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Team Member">
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
        </div>

        <div>
          <label className={labelClass}>Temporary Password</label>
          <input required type="text" value={form.password} onChange={(e) => update('password', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Permissions</label>
          <div className="grid grid-cols-2 gap-2">
            {PERMISSION_FIELDS.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={permissions[p.key]}
                  onChange={(e) => setPermissions((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Adding…' : 'Add Member'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
