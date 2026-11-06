import { useState } from 'react';
import { CONTACT_ROLES, createClientContact, deleteClientContact, updateClientContact } from '../lib/clients';
import { formatEmailInput, formatPhoneNumber } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const emptyForm = { name: '', role: 'partner', email: '', phone: '', notes: '' };
const roleLabel = (role) => CONTACT_ROLES.find((r) => r.value === role)?.label || 'Other';

// The other people around a client. Informational: contracts, invoices and
// email still go to the client themselves.
export default function ClientContactsPanel({ clientId, contacts, canEdit, onChanged }) {
  const [editingId, setEditingId] = useState(null); // contact id, 'new', or null
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  function startNew() { setForm(emptyForm); setEditingId('new'); setError(''); }
  function startEdit(c) {
    setForm({ name: c.name, role: c.role, email: c.email || '', phone: c.phone || '', notes: c.notes || '' });
    setEditingId(c.id); setError('');
  }
  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('A name is required.'); return; }
    setSaving(true);
    try {
      if (editingId === 'new') await createClientContact(clientId, form);
      else await updateClientContact(clientId, editingId, form);
      setEditingId(null); setError('');
      await onChanged?.();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function remove(id) {
    try { await deleteClientContact(clientId, id); setConfirmId(null); await onChanged?.(); } catch (err) { setError(err.message); }
  }

  return (
    <section data-testid="client-contacts-panel" className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">People &amp; contacts</h3>
        {canEdit && editingId === null && (
          <button type="button" onClick={startNew} data-testid="client-add-contact-button" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">+ Add contact</button>
        )}
      </div>
      {error && <p role="alert" className="mb-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {contacts.length === 0 && editingId !== 'new' && <p className="text-sm text-slate-400">No other contacts yet. Add the planner, a partner, or whoever is paying.</p>}
      <ul className="divide-y divide-slate-100">
        {contacts.map((c) => (editingId === c.id ? null : (
          <li key={c.id} data-testid="client-contact-item" className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800">{c.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{roleLabel(c.role)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 text-slate-500">
                {c.email && <a href={`mailto:${c.email}`} className="hover:text-indigo-600">{c.email}</a>}
                {c.phone && <a href={`tel:${c.phone}`} className="hover:text-indigo-600">{c.phone}</a>}
              </div>
              {c.notes && <p className="mt-0.5 whitespace-pre-wrap text-slate-500">{c.notes}</p>}
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-3 text-xs font-semibold">
                <button type="button" onClick={() => startEdit(c)} className="text-slate-500 hover:text-indigo-600">Edit</button>
                {confirmId === c.id ? (
                  <>
                    <button type="button" onClick={() => remove(c.id)} className="text-red-600">Confirm</button>
                    <button type="button" onClick={() => setConfirmId(null)} className="text-slate-500">Cancel</button>
                  </>
                ) : <button type="button" onClick={() => setConfirmId(c.id)} className="text-slate-500 hover:text-red-600">Remove</button>}
              </div>
            )}
          </li>
        )))}
      </ul>
      {editingId !== null && (
        <form onSubmit={save} className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Name *" aria-label="Contact name" data-testid="client-contact-name" maxLength={120} className={inputClass} />
            <select value={form.role} onChange={(e) => update('role', e.target.value)} aria-label="Contact role" data-testid="client-contact-role" className={inputClass}>
              {CONTACT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input type="email" value={form.email} onChange={(e) => update('email', formatEmailInput(e.target.value))} placeholder="Email" aria-label="Contact email" data-testid="client-contact-email" className={inputClass} />
            <input type="tel" value={form.phone} onChange={(e) => update('phone', formatPhoneNumber(e.target.value))} placeholder="Phone" aria-label="Contact phone" data-testid="client-contact-phone" className={inputClass} />
          </div>
          <textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Notes (e.g. best time to reach, decision maker)" aria-label="Contact notes" maxLength={2000} className={inputClass} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setEditingId(null); setError(''); }} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={saving} data-testid="client-contact-save" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">{editingId === 'new' ? 'Add contact' : 'Save'}</button>
          </div>
        </form>
      )}
    </section>
  );
}
