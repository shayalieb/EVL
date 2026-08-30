import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createAgencyGroup, deleteAgencyGroup, listAgencyGroups, updateAgencyGroup } from '../lib/agencyGroups';
import { useToast } from '../components/ui/Toast';
import { resizeImageToDataUrl } from '../lib/resizeImage';

const empty = { name: '', description: '', logo: '', active: true, stationery: { businessName: '', address: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: '', phone: '', email: '', accentColor: '#6366f1', documentLayout: 'classic', footer: '' } };
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
  function startEdit(group) {
    const stationery = { ...empty.stationery, ...(group.stationery || {}) };
    if (!stationery.addressLine1 && stationery.address) stationery.addressLine1 = stationery.address;
    setEditing(group.id);
    setForm({ ...group, stationery });
  }
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
    <GroupEditor form={form} editing={editing} busy={busy} processingLogo={processingLogo} update={update} updateStationery={updateStationery} changeLogo={changeLogo} save={save} reset={reset} />
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{groups.map((group) => <article key={group.id} className={`bg-white rounded-2xl border p-5 shadow-sm ${group.active ? 'border-slate-200' : 'border-slate-200 opacity-65'}`}>
        <div className="flex items-start gap-3">{group.logo ? <img src={group.logo} alt="" className="h-12 w-12 rounded-lg object-contain border" /> : <div className="h-12 w-12 rounded-lg flex items-center justify-center text-lg font-bold text-white" style={{ backgroundColor: group.stationery?.accentColor || '#6366f1' }}>{group.name[0]}</div>}<div className="min-w-0 flex-1"><h2 className="font-bold text-slate-900 truncate">{group.name}</h2><p className="text-xs text-slate-500">{group.active ? 'Active' : 'Archived'} · {group.stationery?.businessName || 'Stationery uses group name'}</p></div></div>
        <div className="grid grid-cols-3 gap-2 mt-5 text-center"><SmallMetric label="Bookings" value={group.stats.activeBookings} /><SmallMetric label="Upcoming" value={group.stats.upcomingEvents} /><SmallMetric label="Completed" value={group.stats.completedEvents} /></div>
        <p className="text-sm text-slate-500 mt-4 line-clamp-2 min-h-10">{group.description || 'No group notes yet.'}</p>
        <div className="flex flex-wrap gap-2 mt-4"><Link to={`/bookings?groupId=${group.id}`} className="text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">Bookings</Link><Link to={`/events?groupId=${group.id}`} className="text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">Events</Link><button onClick={() => startEdit(group)} className="text-xs font-semibold text-slate-700 border rounded-lg px-3 py-2">Edit</button><button onClick={() => remove(group)} className="text-xs font-semibold text-red-600 px-2 py-2">Delete</button></div>
      </article>)}</div>
  </div>;
}

function Metric({ label, value }) { return <div className="bg-white border border-slate-200 rounded-2xl p-5"><p className="text-2xl font-bold text-slate-900">{value}</p><p className="text-sm text-slate-500">{label}</p></div>; }
function SmallMetric({ label, value }) { return <div className="rounded-lg bg-slate-50 px-2 py-2"><p className="font-bold text-slate-800">{value}</p><p className="text-[10px] uppercase text-slate-400">{label}</p></div>; }
function Field({ label, value, onChange, rows, ...props }) { const Element = rows ? 'textarea' : 'input'; return <div><label className={labelClass}>{label}</label><Element rows={rows} value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputClass} {...props} /></div>; }

function Section({ title, description, children }) {
  return <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold text-slate-800">{title}</h3>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}<div className="mt-4">{children}</div></section>;
}

function GroupEditor({ form, editing, busy, processingLogo, update, updateStationery, changeLogo, save, reset }) {
  return <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5"><div><h2 className="text-xl font-bold text-slate-900">{editing ? 'Edit managed group' : 'Add managed group'}</h2><p className="mt-1 text-sm text-slate-500">Set the group identity, contact information, and document branding.</p></div>{editing && <button type="button" onClick={reset} className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600">Cancel editing</button>}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <Section title="Group identity" description="Internal information used throughout the agency workspace."><div className="grid gap-4 sm:grid-cols-2"><Field label="Group name *" value={form.name} onChange={(value) => update('name', value)} required /><div className="sm:col-span-2"><Field label="Internal notes" value={form.description} onChange={(value) => update('description', value)} rows={3} placeholder="Information only your agency team will see" /></div><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} />Active group</label></div></Section>
      <Section title="Contact information" description="Shown on documents sent for this group."><div className="grid gap-4 sm:grid-cols-2"><Field label="Name shown on documents" value={form.stationery.businessName} onChange={(value) => updateStationery('businessName', value)} placeholder={form.name || 'Group name'} /><Field label="Email" type="email" autoComplete="email" value={form.stationery.email} onChange={(value) => updateStationery('email', value)} placeholder="group@example.com" /><Field label="Phone" type="tel" autoComplete="tel" inputMode="tel" value={form.stationery.phone} onChange={(value) => updateStationery('phone', value)} placeholder="(555) 555-0123" /><div className="hidden sm:block" /><Field label="Street address" autoComplete="address-line1" value={form.stationery.addressLine1} onChange={(value) => updateStationery('addressLine1', value)} /><Field label="Suite / unit" autoComplete="address-line2" value={form.stationery.addressLine2} onChange={(value) => updateStationery('addressLine2', value)} /><Field label="City" autoComplete="address-level2" value={form.stationery.city} onChange={(value) => updateStationery('city', value)} /><Field label="State / province" autoComplete="address-level1" value={form.stationery.state} onChange={(value) => updateStationery('state', value)} /><Field label="Postal code" autoComplete="postal-code" value={form.stationery.postalCode} onChange={(value) => updateStationery('postalCode', value)} /><Field label="Country" autoComplete="country-name" value={form.stationery.country} onChange={(value) => updateStationery('country', value)} /></div></Section>
      <Section title="Logo" description="Used on proposals, contracts, invoices, and other group documents."><div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">{form.logo ? <img src={form.logo} alt={`${form.name || 'Group'} logo preview`} className="max-h-full max-w-full object-contain" /> : <span className="px-2 text-center text-xs text-slate-400">No logo</span>}</div><div><label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-indigo-300 bg-white px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{processingLogo ? 'Processing…' : form.logo ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={changeLogo} disabled={processingLogo} className="hidden" data-testid="agency-group-logo-input" /></label>{form.logo && <button type="button" onClick={() => update('logo', '')} className="ml-3 min-h-10 text-xs font-semibold text-rose-600" data-testid="agency-group-remove-logo">Remove</button>}<p className="mt-2 text-xs text-slate-400">PNG, JPG, or WebP up to 10 MB.</p></div></div></Section>
      <Section title="Document appearance" description="Controls how this group’s client-facing documents look."><div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass}>Accent color</label><div className="flex items-center gap-3"><input type="color" value={form.stationery.accentColor} onChange={(event) => updateStationery('accentColor', event.target.value)} className="h-11 w-16 rounded-lg border border-slate-300 bg-white p-1" /><span className="text-sm font-medium uppercase text-slate-500">{form.stationery.accentColor}</span></div></div><div><label className={labelClass}>Document style</label><select value={form.stationery.documentLayout} onChange={(event) => updateStationery('documentLayout', event.target.value)} className={inputClass}><option value="classic">Classic</option><option value="modern">Modern</option><option value="minimal">Minimal</option></select></div><div className="sm:col-span-2"><Field label="Document footer" value={form.stationery.footer} onChange={(value) => updateStationery('footer', value)} rows={3} placeholder="Optional message shown at the bottom of documents" /></div></div></Section>
    </div>
    <div className="mt-5 flex justify-end"><button disabled={busy || processingLogo} className="min-h-11 rounded-lg bg-indigo-600 px-6 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : editing ? 'Save changes' : 'Add group'}</button></div>
  </form>;
}
