import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createAgencyGroup, deleteAgencyGroup, listAgencyGroups, updateAgencyGroup } from '../lib/agencyGroups';
import { useToast } from '../components/ui/Toast';
import { resizeImageToDataUrl } from '../lib/resizeImage';
import { useAuth } from '../context/AuthContext';

const empty = { name: '', description: '', logo: '', active: true, stationery: { businessName: '', address: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: '', phone: '', email: '', accentColor: '#6366f1', documentLayout: 'classic', footer: '' } };
const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

export default function AgencyGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [groupView, setGroupView] = useState('active');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [processingLogo, setProcessingLogo] = useState(false);
  const { showToast } = useToast();
  const { can } = useAuth();
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
  async function setArchived(group, archived) {
    const message = archived ? `Archive ${group.name}? It will no longer be available for new bookings or events, but all history will remain.` : `Restore ${group.name} as an active managed group?`;
    if (!window.confirm(message)) return;
    try { await updateAgencyGroup(group.id, { active: !archived }); await load(); showToast(archived ? 'Group archived' : 'Group restored'); } catch (error) { showToast(error.message, 'error'); }
  }
  async function remove(group) {
    if (!window.confirm(`Permanently delete ${group.name}? This cannot be undone.`)) return;
    try { await deleteAgencyGroup(group.id); await load(); showToast('Group deleted'); } catch (error) { showToast(error.message, 'error'); }
  }
  const totals = groups.reduce((sum, group) => ({ bookings: sum.bookings + group.stats.activeBookings, events: sum.events + group.stats.upcomingEvents }), { bookings: 0, events: 0 });
  const visibleGroups = groups.filter((group) => groupView === 'all' || (groupView === 'active' ? group.active : !group.active));
  return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-7">
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Agency workspace</p><h1 className="text-3xl font-bold text-slate-900">Managed Groups</h1><p className="text-slate-500 mt-1">Each group has its own workflow identity and stationery. Agency contacts, contractors, venues, catalogs, and searches stay shared.</p></div><button onClick={reset} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">+ Add group</button></div>
    <div className="grid sm:grid-cols-3 gap-4"><Metric label="Managed groups" value={groups.filter((g) => g.active).length} /><Metric label="Active bookings" value={totals.bookings} /><Metric label="Upcoming events" value={totals.events} /></div>
    <GroupEditor form={form} editing={editing} busy={busy} processingLogo={processingLogo} update={update} updateStationery={updateStationery} changeLogo={changeLogo} save={save} reset={reset} />
    <div><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Group operations</h2><p className="text-xs text-slate-400">Current activity and setup health</p></div><div className="flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Group status">{[['active', 'Active'], ['archived', `Archived (${groups.filter((group) => !group.active).length})`], ['all', 'All']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={groupView === value} onClick={() => setGroupView(value)} className={`min-h-9 rounded-md px-3 text-xs font-semibold ${groupView === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div></div>{visibleGroups.length > 0 ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{visibleGroups.map((group) => <GroupCard key={group.id} group={group} canViewFinancials={can('viewFinancials')} startEdit={startEdit} setArchived={setArchived} remove={remove} />)}</div> : <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-400">No {groupView === 'all' ? '' : groupView} groups found.</div>}</div>
  </div>;
}

function Metric({ label, value }) { return <div className="bg-white border border-slate-200 rounded-2xl p-5"><p className="text-2xl font-bold text-slate-900">{value}</p><p className="text-sm text-slate-500">{label}</p></div>; }
function SmallMetric({ label, value }) { return <div className="rounded-lg bg-slate-50 px-2 py-2"><p className="font-bold text-slate-800">{value}</p><p className="text-[10px] uppercase text-slate-400">{label}</p></div>; }
function Field({ label, value, onChange, rows, ...props }) { const Element = rows ? 'textarea' : 'input'; return <div><label className={labelClass}>{label}</label><Element rows={rows} value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputClass} {...props} /></div>; }

function Section({ title, description, children }) {
  return <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold text-slate-800">{title}</h3>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}<div className="mt-4">{children}</div></section>;
}

function GroupEditor({ form, editing, busy, processingLogo, update, updateStationery, changeLogo, save, reset }) {
  const [previewType, setPreviewType] = useState('proposal');
  return <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5"><div><h2 className="text-xl font-bold text-slate-900">{editing ? 'Edit managed group' : 'Add managed group'}</h2><p className="mt-1 text-sm text-slate-500">Set the group identity, contact information, and document branding.</p></div>{editing && <button type="button" onClick={reset} className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600">Cancel editing</button>}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <Section title="Group identity" description="Internal information used throughout the agency workspace."><div className="grid gap-4 sm:grid-cols-2"><Field label="Group name *" value={form.name} onChange={(value) => update('name', value)} required /><div className="sm:col-span-2"><Field label="Internal notes" value={form.description} onChange={(value) => update('description', value)} rows={3} placeholder="Information only your agency team will see" /></div></div></Section>
      <Section title="Contact information" description="Shown on documents sent for this group."><div className="grid gap-4 sm:grid-cols-2"><Field label="Name shown on documents" value={form.stationery.businessName} onChange={(value) => updateStationery('businessName', value)} placeholder={form.name || 'Group name'} /><Field label="Email" type="email" autoComplete="email" value={form.stationery.email} onChange={(value) => updateStationery('email', value)} placeholder="group@example.com" /><Field label="Phone" type="tel" autoComplete="tel" inputMode="tel" value={form.stationery.phone} onChange={(value) => updateStationery('phone', value)} placeholder="(555) 555-0123" /><div className="hidden sm:block" /><Field label="Street address" autoComplete="address-line1" value={form.stationery.addressLine1} onChange={(value) => updateStationery('addressLine1', value)} /><Field label="Suite / unit" autoComplete="address-line2" value={form.stationery.addressLine2} onChange={(value) => updateStationery('addressLine2', value)} /><Field label="City" autoComplete="address-level2" value={form.stationery.city} onChange={(value) => updateStationery('city', value)} /><Field label="State / province" autoComplete="address-level1" value={form.stationery.state} onChange={(value) => updateStationery('state', value)} /><Field label="Postal code" autoComplete="postal-code" value={form.stationery.postalCode} onChange={(value) => updateStationery('postalCode', value)} /><Field label="Country" autoComplete="country-name" value={form.stationery.country} onChange={(value) => updateStationery('country', value)} /></div></Section>
      <Section title="Logo" description="Used on proposals, contracts, invoices, and other group documents."><div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">{form.logo ? <img src={form.logo} alt={`${form.name || 'Group'} logo preview`} className="max-h-full max-w-full object-contain" /> : <span className="px-2 text-center text-xs text-slate-400">No logo</span>}</div><div><label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-indigo-300 bg-white px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{processingLogo ? 'Processing…' : form.logo ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={changeLogo} disabled={processingLogo} className="hidden" data-testid="agency-group-logo-input" /></label>{form.logo && <button type="button" onClick={() => update('logo', '')} className="ml-3 min-h-10 text-xs font-semibold text-rose-600" data-testid="agency-group-remove-logo">Remove</button>}<p className="mt-2 text-xs text-slate-400">PNG, JPG, or WebP up to 10 MB.</p></div></div></Section>
      <Section title="Document appearance" description="Controls how this group’s client-facing documents look."><div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass}>Accent color</label><div className="flex items-center gap-3"><input type="color" value={form.stationery.accentColor} onChange={(event) => updateStationery('accentColor', event.target.value)} className="h-11 w-16 rounded-lg border border-slate-300 bg-white p-1" /><span className="text-sm font-medium uppercase text-slate-500">{form.stationery.accentColor}</span></div></div><div><label className={labelClass}>Document style</label><select value={form.stationery.documentLayout} onChange={(event) => updateStationery('documentLayout', event.target.value)} className={inputClass}><option value="classic">Classic</option><option value="modern">Modern</option><option value="minimal">Minimal</option></select></div><div className="sm:col-span-2"><Field label="Document footer" value={form.stationery.footer} onChange={(value) => updateStationery('footer', value)} rows={3} placeholder="Optional message shown at the bottom of documents" /></div></div></Section>
      <div className="xl:col-span-2"><Section title="Document preview" description="See how this group’s saved branding will appear before sending a document."><div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Preview document type">{['proposal', 'contract', 'invoice'].map((type) => <button key={type} type="button" role="tab" aria-selected={previewType === type} onClick={() => setPreviewType(type)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold capitalize ${previewType === type ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{type}</button>)}</div><GroupDocumentPreview form={form} type={previewType} /></Section></div>
    </div>
    <div className="mt-5 flex justify-end"><button disabled={busy || processingLogo} className="min-h-11 rounded-lg bg-indigo-600 px-6 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : editing ? 'Save changes' : 'Add group'}</button></div>
  </form>;
}

function GroupDocumentPreview({ form, type }) {
  const stationery = form.stationery;
  const displayName = stationery.businessName || form.name || 'Your group name';
  const contact = [stationery.phone, stationery.email].filter(Boolean).join(' · ') || 'Phone · Email';
  const address = [stationery.addressLine1, stationery.addressLine2, [stationery.city, stationery.state, stationery.postalCode].filter(Boolean).join(' '), stationery.country].filter(Boolean).join(', ') || 'Business address';
  const accent = stationery.accentColor || '#6366f1';
  const layout = stationery.documentLayout || 'classic';
  const titles = { proposal: 'Event Proposal', contract: 'Performance Agreement', invoice: 'Invoice #1040' };
  const labels = { proposal: ['Event services', 'Production package'], contract: ['Performance services', 'Production requirements'], invoice: ['Event services', 'Additional production'] };
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-3 sm:p-6" data-testid="agency-group-document-preview">
    <article className={`mx-auto min-h-[30rem] max-w-3xl bg-white shadow-sm ${layout === 'modern' ? 'rounded-xl overflow-hidden' : 'border border-slate-200'} ${layout === 'minimal' ? 'p-8 sm:p-10' : ''}`}>
      {layout === 'modern' && <div className="h-3" style={{ backgroundColor: accent }} />}
      <div className={layout === 'minimal' ? '' : 'p-7 sm:p-9'}>
        <header className={`flex gap-5 ${layout === 'classic' ? 'items-start border-b pb-6' : 'items-center'} ${layout === 'minimal' ? 'border-b border-slate-900 pb-5' : ''}`} style={{ borderColor: layout === 'classic' ? accent : undefined }}>
          {form.logo ? <img src={form.logo} alt="" className="h-14 w-24 shrink-0 object-contain object-left" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-xl font-bold text-white" style={{ backgroundColor: accent }}>{displayName.slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-0 flex-1"><h4 className="truncate text-xl font-bold text-slate-900">{displayName}</h4><p className="mt-1 text-xs text-slate-500">{contact}</p><p className="mt-0.5 text-xs text-slate-400">{address}</p></div>
        </header>
        <div className="mt-8 flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>{type}</p><h5 className="mt-1 text-2xl font-bold text-slate-900">{titles[type]}</h5></div><div className="text-right text-xs text-slate-500"><p className="font-semibold text-slate-700">Sample Client</p><p>Sample Event · October 24, 2026</p></div></div>
        {type === 'contract' ? <div className="mt-8 space-y-4 text-sm leading-6 text-slate-600"><p>This agreement confirms the services and event details outlined below between {displayName} and Sample Client.</p><h6 className="font-bold text-slate-800">Services and responsibilities</h6><p>The group will provide the agreed performance and production services. Final timing and event requirements will be confirmed before the event date.</p></div> : <div className="mt-8 overflow-hidden rounded-lg border border-slate-200"><div className="grid grid-cols-[1fr_auto] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500"><span>Description</span><span>Amount</span></div>{labels[type].map((label, index) => <div key={label} className="grid grid-cols-[1fr_auto] border-t border-slate-100 px-4 py-4 text-sm"><span className="text-slate-700">{label}</span><span className="font-semibold text-slate-800">${index === 0 ? '4,500.00' : '750.00'}</span></div>)}<div className="grid grid-cols-[1fr_auto] border-t-2 px-4 py-4"><span className="font-bold text-slate-800">Total</span><span className="text-lg font-bold" style={{ color: accent }}>$5,250.00</span></div></div>}
        <div className="mt-10 border-t border-slate-100 pt-5 text-center text-xs text-slate-400">{stationery.footer || `Thank you for choosing ${displayName}.`}</div>
      </div>
    </article>
  </div>;
}

function money(value) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0); }

function GroupCard({ group, canViewFinancials, startEdit, setArchived, remove }) {
  const stationery = group.stationery || {};
  const setupItems = [{ label: 'logo', ready: !!group.logo }, { label: 'document name', ready: !!(stationery.businessName || group.name) }, { label: 'email', ready: !!stationery.email }, { label: 'phone', ready: !!stationery.phone }, { label: 'address', ready: !!(stationery.addressLine1 || stationery.address) }];
  const missing = setupItems.filter((item) => !item.ready);
  const completeness = Math.round(((setupItems.length - missing.length) / setupItems.length) * 100);
  return <article className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${group.active ? 'border-slate-200' : 'border-slate-200 opacity-65'}`}>
    <div className="flex items-start gap-3">{group.logo ? <img src={group.logo} alt="" className="h-12 w-12 rounded-lg border object-contain" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold text-white" style={{ backgroundColor: stationery.accentColor || '#6366f1' }}>{group.name[0]}</div>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="truncate font-bold text-slate-900">{group.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${group.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{group.active ? 'Active' : 'Archived'}</span></div><p className="truncate text-xs text-slate-500">{stationery.businessName || 'Uses group name on documents'}</p></div></div>
    <div className="mt-5 grid grid-cols-3 gap-2 text-center"><SmallMetric label="Bookings" value={group.stats.activeBookings} /><SmallMetric label="Upcoming" value={group.stats.upcomingEvents} /><SmallMetric label="Completed" value={group.stats.completedEvents} /></div>
    {canViewFinancials && <div className="mt-3 grid grid-cols-3 gap-2 text-center"><SmallMetric label="Invoiced" value={money(group.stats.invoicedRevenue)} /><SmallMetric label="Client due" value={money(group.stats.outstandingBalance)} /><SmallMetric label="Crew due" value={money(group.stats.contractorDue)} /></div>}
    <div className="mt-4 rounded-lg bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-500">Setup completeness</span><span className={`text-xs font-bold ${completeness === 100 ? 'text-emerald-700' : 'text-amber-700'}`}>{completeness}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${completeness === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${completeness}%` }} /></div>{missing.length > 0 && <p className="mt-2 text-[11px] text-amber-700">Missing {missing.map((item) => item.label).join(', ')}</p>}</div>
    <div className="mt-4 min-h-10"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Next event</p><p className="mt-1 truncate text-sm font-semibold text-slate-700">{group.stats.nextEvent ? `${group.stats.nextEvent.name} · ${new Date(`${group.stats.nextEvent.date}T12:00:00`).toLocaleDateString()}` : 'No upcoming event scheduled'}</p></div>
    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">{group.active && <><Link to={`/bookings?groupId=${group.id}`} className="min-h-10 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">Open group</Link><Link to={`/events?groupId=${group.id}`} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Events</Link>{canViewFinancials && <Link to={`/financials?groupId=${group.id}`} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Financials</Link>}</>}<button type="button" onClick={() => startEdit(group)} className={`${group.active ? 'ml-auto' : ''} min-h-10 px-2 text-xs font-semibold text-slate-600`}>Edit</button><button type="button" onClick={() => setArchived(group, group.active)} className={`min-h-10 px-2 text-xs font-semibold ${group.active ? 'text-amber-700' : 'text-emerald-700'}`}>{group.active ? 'Archive' : 'Restore'}</button>{!group.active && group.stats.canDelete && <button type="button" onClick={() => remove(group)} className="min-h-10 px-2 text-xs font-semibold text-rose-600">Delete permanently</button>}</div>
  </article>;
}
