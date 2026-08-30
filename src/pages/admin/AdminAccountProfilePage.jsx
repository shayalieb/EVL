import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

const TABS = [['overview', 'Overview'], ['team', 'Users'], ['notes', 'Internal Notes'], ['history', 'History']];
const CATEGORY_LABELS = { general: 'General', sales: 'Sales', onboarding: 'Onboarding', billing: 'Billing', support: 'Support', risk: 'Risk' };
const CATEGORY_STYLES = { general: 'bg-slate-100 text-slate-600', sales: 'bg-violet-100 text-violet-700', onboarding: 'bg-blue-100 text-blue-700', billing: 'bg-emerald-100 text-emerald-700', support: 'bg-cyan-100 text-cyan-700', risk: 'bg-red-100 text-red-700' };
const VERTICAL_LABELS = { band_orchestra: 'Band & Orchestra', party_planning: 'Event and Party Planning', photography: 'Photography' };

function Stat({ label, value, detail }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>; }
function Info({ label, children }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm text-slate-700 break-words">{children || '—'}</dd></div>; }

export default function AdminAccountProfilePage() {
  const { accountId } = useParams();
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [note, setNote] = useState({ body: '', category: 'general', pinned: false, followUpAt: '' });
  const [saving, setSaving] = useState(false);

  function load() { apiFetch(`/admin/accounts/${accountId}/profile`).then((data) => setProfile(data.profile)).catch((err) => setError(err.message)); }
  useEffect(load, [accountId]);

  const owner = profile?.members.find((member) => member.role === 'owner');
  const displayName = profile?.business.name || (owner ? `${owner.user.firstName} ${owner.user.lastName}` : 'Account profile');
  const dueFollowUps = useMemo(() => profile?.notes.filter((item) => item.followUpAt && new Date(item.followUpAt) <= new Date()).length || 0, [profile]);

  async function addNote(e) {
    e.preventDefault(); if (!note.body.trim()) return; setSaving(true);
    try {
      const data = await apiFetch(`/admin/accounts/${accountId}/notes`, { method: 'POST', body: JSON.stringify({ ...note, followUpAt: note.followUpAt ? new Date(note.followUpAt).toISOString() : null }) });
      setProfile((current) => ({ ...current, notes: [data.note, ...current.notes] }));
      setNote({ body: '', category: 'general', pinned: false, followUpAt: '' });
      showToast('Internal note added');
    } catch (err) { showToast(err.message, 'error'); } finally { setSaving(false); }
  }

  async function togglePinned(item) {
    try { const data = await apiFetch(`/admin/accounts/${accountId}/notes/${item.id}`, { method: 'PATCH', body: JSON.stringify({ pinned: !item.pinned }) }); setProfile((current) => ({ ...current, notes: current.notes.map((existing) => existing.id === item.id ? data.note : existing).sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt) - new Date(a.createdAt)) })); }
    catch (err) { showToast(err.message, 'error'); }
  }

  async function changePlan(planTier) {
    try {
      const data = await apiFetch(`/admin/accounts/${accountId}/plan`, { method: 'PATCH', body: JSON.stringify({ planTier }) });
      setProfile((current) => ({ ...current, ...data }));
      showToast(planTier === 'agency' ? 'Agency workspace activated' : 'Plan updated');
    } catch (err) { showToast(err.message, 'error'); }
  }

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!profile) return <div className="text-sm text-slate-400">Loading profile…</div>;
  const status = profile.disabledAt ? 'Disabled' : !profile.approvedAt ? 'Needs approval' : 'Active';

  return <div className="max-w-6xl space-y-5">
    <div><Link to="/admin/accounts" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">← Back to accounts</Link><div className="mt-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold text-slate-800">{displayName}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'Disabled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{status}</span>{dueFollowUps > 0 && <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white">{dueFollowUps} follow-up{dueFollowUps === 1 ? '' : 's'} due</span>}</div><p className="mt-1 text-sm text-slate-500">{owner?.user.email} · Account since {new Date(profile.createdAt).toLocaleDateString()}</p></div></div></div>
    <div className="overflow-x-auto border-b border-slate-200"><div className="flex min-w-max gap-1">{TABS.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>{label}{id === 'notes' && profile.notes.length > 0 && <span className="ml-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{profile.notes.length}</span>}</button>)}</div></div>

    {tab === 'overview' && <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Team users" value={profile.members.length} detail={`${profile.planTier || profile.signupPlan || 'No plan'} plan`} /><Stat label="Bookings" value={profile.dataSummary.bookings} /><Stat label="Events" value={profile.dataSummary.events} /><Stat label="Support" value={(profile.supportSummary.open || 0) + (profile.supportSummary.closed || 0)} detail={`${profile.supportSummary.open || 0} open`} /></div>
      <div className="grid md:grid-cols-2 gap-5"><section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-800">Business profile</h3><dl className="mt-4 grid sm:grid-cols-2 gap-5"><Info label="Business name">{profile.business.name}</Info><Info label="Business type">{VERTICAL_LABELS[profile.vertical] || profile.vertical}{profile.allVerticalsEnabled ? ' · All types enabled' : ''}</Info><Info label="Business email">{profile.business.email}</Info><Info label="Business phone">{profile.business.phone}</Info><Info label="Address">{profile.business.address}</Info><Info label="Owner">{owner ? `${owner.user.firstName} ${owner.user.lastName}` : ''}</Info></dl></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-800">Plan and acquisition</h3><dl className="mt-4 grid sm:grid-cols-2 gap-5"><Info label="Current plan">{profile.planTier || profile.signupPlan || 'No plan'}</Info><Info label="Billing">{profile.billingInterval || profile.signupInterval || 'Not selected'}</Info><Info label="Subscription">{profile.subscriptionStatus || 'Not started'}</Info><Info label="Trial ends">{profile.trialEndsAt ? new Date(profile.trialEndsAt).toLocaleDateString() : '—'}</Info><Info label="Signup source">{profile.signupSource === 'public' ? 'Website' : 'Admin invitation'}</Info><Info label="Stripe payments">{profile.stripeConnected ? (profile.stripeChargesEnabled ? 'Connected and active' : 'Connected, action needed') : 'Not connected'}</Info></dl></section></div>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h3 className="font-bold text-slate-800">Plan access</h3><p className="text-sm text-slate-500 mt-1">Agency activates managed groups and custom branding without self-service Stripe pricing.</p></div><select aria-label="Account plan" value={profile.planTier || ''} onChange={(event) => changePlan(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"><option value="" disabled>Select plan</option><option value="solo">Solo</option><option value="team">Team</option><option value="studio">Studio</option><option value="agency">Agency</option></select></div></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-800">Data footprint</h3><div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm"><Info label="Clients">{profile.dataSummary.clients}</Info><Info label="Contractors">{profile.dataSummary.contractors}</Info><Info label="Bookings">{profile.dataSummary.bookings}</Info><Info label="Events">{profile.dataSummary.events}</Info></div></section>
    </div>}

    {tab === 'team' && <section className="rounded-xl border border-slate-200 bg-white overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">Account users</h3><p className="text-sm text-slate-500 mt-1">Every person with access to this business account.</p></div><div className="divide-y divide-slate-100">{profile.members.map((member) => <div key={member.id} className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-semibold text-slate-800">{member.user.firstName} {member.user.lastName}</p><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">{member.role}</span>{!member.user.hasPassword && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Invite pending</span>}</div><p className="text-sm text-slate-500 mt-1">{member.user.email}{member.user.phone ? ` · ${member.user.phone}` : ''}</p></div><div className="text-xs text-slate-400">Joined {new Date(member.joinedAt).toLocaleDateString()}</div></div>)}</div></section>}

        {tab === 'notes' && <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-5 items-start"><form onSubmit={addNote} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 lg:sticky lg:top-4"><div><h3 className="font-bold text-slate-800">Add internal note</h3><p className="text-xs text-slate-500 mt-1">Visible only to platform admins. Notes are retained as written.</p></div><div><label className="block text-xs font-semibold text-slate-500 mb-1">Category</label><select value={note.category} onChange={(e) => setNote((current) => ({ ...current, category: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label className="block text-xs font-semibold text-slate-500 mb-1">Note</label><textarea required rows={6} maxLength={5000} value={note.body} onChange={(e) => setNote((current) => ({ ...current, body: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Add context, a decision, or the next step…" /></div><div><label className="block text-xs font-semibold text-slate-500 mb-1">Follow-up date (optional)</label><input type="datetime-local" value={note.followUpAt} onChange={(e) => setNote((current) => ({ ...current, followUpAt: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={note.pinned} onChange={(e) => setNote((current) => ({ ...current, pinned: e.target.checked }))} />Pin this note</label><button disabled={saving} className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Adding…' : 'Add note'}</button></form><section className="space-y-3">{profile.notes.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">No internal notes yet.</div>}{profile.notes.map((item) => <article key={item.id} className={`rounded-xl border bg-white p-4 ${item.pinned ? 'border-amber-300 shadow-sm' : 'border-slate-200'}`}><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${CATEGORY_STYLES[item.category]}`}>{CATEGORY_LABELS[item.category]}</span>{item.pinned && <span className="text-xs text-amber-600">📌 Pinned</span>}{item.followUpAt && <span className={`text-xs font-semibold ${new Date(item.followUpAt) <= new Date() ? 'text-red-600' : 'text-slate-500'}`}>Follow up {new Date(item.followUpAt).toLocaleString()}</span>}</div><button type="button" onClick={() => togglePinned(item)} className="text-xs font-semibold text-slate-500 hover:text-indigo-600">{item.pinned ? 'Unpin' : 'Pin'}</button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{item.body}</p><p className="mt-3 text-[11px] text-slate-400">{item.author ? `${item.author.firstName} ${item.author.lastName}` : 'Former admin'} · {new Date(item.createdAt).toLocaleString()}</p></article>)}</section></div>}

    {tab === 'history' && <section className="rounded-xl border border-slate-200 bg-white p-5"><div><h3 className="font-bold text-slate-800">Account history</h3><p className="text-sm text-slate-500 mt-1">System-generated events are immutable and retained for operational context.</p></div><div className="mt-6 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200 space-y-5">{profile.activities.map((activity) => <div key={activity.id} className="relative pl-7"><span className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-indigo-500 shadow ring-1 ring-slate-200" /><p className="text-sm font-semibold text-slate-800">{activity.summary}</p><p className="mt-0.5 text-xs text-slate-400">{new Date(activity.createdAt).toLocaleString()}{activity.actor ? ` · ${activity.actor.firstName} ${activity.actor.lastName}` : ' · System'}</p>{activity.metadata?.reason && <p className="mt-1 text-xs text-slate-500">Reason: {activity.metadata.reason}</p>}</div>)}</div></section>}
  </div>;
}
