import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createAgencyGroup, deleteAgencyGroup, listAgencyGroups, updateAgencyGroup } from '../lib/agencyGroups';
import { useToast } from '../components/ui/Toast';
import { resizeImageToDataUrl } from '../lib/resizeImage';

const empty = { name: '', description: '', logo: '', active: true, stationery: { businessName: '', address: '', phone: '', email: '', accentColor: '#6366f1', documentLayout: 'classic', footer: '' } };
const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

export default function AgencyGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [processingLogo, setProcessingLogo] = useState(false);
  const { showToast } = useToast();
  const load = () => listAgencyGroups().then(setGroups).catch((error) => showToast(error.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateStationery = (key, value) => setForm((current) => ({ ...current, stationery: { ...current.stationery, [key]: value } }));
  function startEdit(group) { setEditing(group.id); setForm({ ...group, stationery: { ...empty.stationery, ...(group.stationery || {}) } }); }
  function reset() { setEditing(null); setForm(empty); }
  async function changeLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return showToast('Choose a PNG, JPG, or WebP image.', 'error');
    if (file.size > 10 * 1024 * 1024) return showToast('Choose an image smaller than 10 MB.', 'error');
    setProcessingLogo(true);
    try {
      const logo = await resizeImageToDataUrl(file, 300);
      update('logo', logo);
    } catch (error) {
      showToast(error.message || 'Could not process that logo.', 'error');
    } finally {
      setProcessingLogo(false);
    }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true);
    try { if (editing) await updateAgencyGroup(editing, form); else await createAgencyGroup(form); showToast(editing ? 'Group updated' : 'Group added'); reset(); await load(); }
    catch (error) { showToast(error.message, 'error'); } finally { setBusy(false); }
  }
  async function remove(group) {
    if (!window.confirm(`Delete ${group.name}? Groups with workflow history must be archived instead.`)) return;
    try { await deleteAgencyGroup(group.id); await load(); showToast('Group deleted'); } catch (error) { showToast(error.message, 'error'); }
  }
  const totals = groups.reduce((sum, group) => ({ bookings: sum.bookings + group.stats.activeBookings, events: sum.events + group.stats.upcomingEvents }), { bookings: 0, events: 0 });
  return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-7">
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Agency workspace</p><h1 className="text-3xl font-bold text-slate-900">Managed Groups</h1><p className="text-slate-500 mt-1">Each group has its own workflow identity and stationery. Agency contacts, contractors, venues, catalogs, and searches stay shared.</p></div><button onClick={reset} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">+ Add group</button></div>
    <div className="grid sm:grid-cols-3 gap-4"><Metric label="Managed groups" value={groups.filter((g) => g.active).length} /><Metric label="Active bookings" value={totals.bookings} /><Metric label="Upcoming events" value={totals.events} /></div>
    <div className="grid lg:grid-cols-[1fr_24rem] gap-6 items-start">
      <div className="grid sm:grid-cols-2 gap-4">{groups.map((group) => <article key={group.id} className={`bg-white rounded-2xl border p-5 shadow-sm ${group.active ? 'border-slate-200' : 'border-slate-200 opacity-65'}`}>
        <div className="flex items-start gap-3">{group.logo ? <img src={group.logo} alt="" className="h-12 w-12 rounded-lg object-contain border" /> : <div className="h-12 w-12 rounded-lg flex items-center justify-center text-lg font-bold text-white" style={{ backgroundColor: group.stationery?.accentColor || '#6366f1' }}>{group.name[0]}</div>}<div className="min-w-0 flex-1"><h2 className="font-bold text-slate-900 truncate">{group.name}</h2><p className="text-xs text-slate-500">{group.active ? 'Active' : 'Archived'} · {group.stationery?.businessName || 'Stationery uses group name'}</p></div></div>
        <div className="grid grid-cols-3 gap-2 mt-5 text-center"><SmallMetric label="Bookings" value={group.stats.activeBookings} /><SmallMetric label="Upcoming" value={group.stats.upcomingEvents} /><SmallMetric label="Completed" value={group.stats.completedEvents} /></div>
        <p className="text-sm text-slate-500 mt-4 line-clamp-2 min-h-10">{group.description || 'No group notes yet.'}</p>
        <div className="flex flex-wrap gap-2 mt-4"><Link to={`/bookings?groupId=${group.id}`} className="text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">Bookings</Link><Link to={`/events?groupId=${group.id}`} className="text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">Events</Link><button onClick={() => startEdit(group)} className="text-xs font-semibold text-slate-700 border rounded-lg px-3 py-2">Edit</button><button onClick={() => remove(group)} className="text-xs font-semibold text-red-600 px-2 py-2">Delete</button></div>
      </article>)}</div>
      <form onSubmit={save} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 lg:sticky lg:top-6"><div><h2 className="font-bold text-slate-900">{editing ? 'Edit group' : 'Add managed group'}</h2><p className="text-xs text-slate-500 mt-1">Branding here is used for this group’s documents while the agency directory remains global.</p></div><Field label="Group name *" value={form.name} onChange={(v) => update('name', v)} required /><Field label="Description / internal notes" value={form.description} onChange={(v) => update('description', v)} rows={3} /><div><label className={labelClass}>Group logo</label><div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">{form.logo ? <img src={form.logo} alt={`${form.name || 'Group'} logo preview`} className="max-h-full max-w-full object-contain" /> : <span className="px-2 text-center text-xs text-slate-400">No logo</span>}</div><div className="min-w-0"><label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-indigo-300 bg-white px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{processingLogo ? 'Processing…' : form.logo ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={changeLogo} disabled={processingLogo} className="hidden" data-testid="agency-group-logo-input" /></label>{form.logo && <button type="button" onClick={() => update('logo', '')} className="ml-3 min-h-10 text-xs font-semibold text-rose-600 hover:text-rose-700" data-testid="agency-group-remove-logo">Remove</button>}<p className="mt-1 text-[11px] leading-4 text-slate-400">PNG, JPG, or WebP. Used on this group’s documents.</p></div></div></div><Field label="Stationery business name" value={form.stationery.businessName} onChange={(v) => updateStationery('businessName', v)} /><Field label="Email" type="email" value={form.stationery.email} onChange={(v) => updateStationery('email', v)} /><Field label="Phone" value={form.stationery.phone} onChange={(v) => updateStationery('phone', v)} /><Field label="Address" value={form.stationery.address} onChange={(v) => updateStationery('address', v)} /><div className="grid grid-cols-2 gap-3"><div><label className={labelClass}>Accent color</label><input type="color" value={form.stationery.accentColor} onChange={(e) => updateStationery('accentColor', e.target.value)} className="w-full h-10 rounded border" /></div><div><label className={labelClass}>Document style</label><select value={form.stationery.documentLayout} onChange={(e) => updateStationery('documentLayout', e.target.value)} className={inputClass}><option value="classic">Classic</option><option value="modern">Modern</option><option value="minimal">Minimal</option></select></div></div><Field label="Stationery footer" value={form.stationery.footer} onChange={(v) => updateStationery('footer', v)} rows={2} /><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.active} onChange={(e) => update('active', e.target.checked)} />Active group</label><div className="flex gap-2"><button disabled={busy || processingLogo} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save group'}</button>{editing && <button type="button" onClick={reset} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button>}</div></form>
    </div>
  </div>;
}

function Metric({ label, value }) { return <div className="bg-white border border-slate-200 rounded-2xl p-5"><p className="text-2xl font-bold text-slate-900">{value}</p><p className="text-sm text-slate-500">{label}</p></div>; }
function SmallMetric({ label, value }) { return <div className="rounded-lg bg-slate-50 px-2 py-2"><p className="font-bold text-slate-800">{value}</p><p className="text-[10px] uppercase text-slate-400">{label}</p></div>; }
function Field({ label, value, onChange, rows, ...props }) { const Element = rows ? 'textarea' : 'input'; return <div><label className={labelClass}>{label}</label><Element rows={rows} value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputClass} {...props} /></div>; }
