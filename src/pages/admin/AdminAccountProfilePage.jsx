import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';

const AGREEMENT_TYPE_LABELS = { nda: 'Non-Disclosure Agreement', non_compete: 'Non-Compete and Non-Solicitation Agreement' };

const TABS = [['overview', 'Overview'], ['team', 'Users'], ['messaging', 'Messaging'], ['quickbooks', 'QuickBooks'], ['notes', 'Internal Notes'], ['history', 'History']];
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
  const [viewingAgreement, setViewingAgreement] = useState(null);

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

  async function saveMessaging(input) {
    try {
      const data = await apiFetch(`/admin/accounts/${accountId}/messaging`, { method: 'PATCH', body: JSON.stringify(input) });
      setProfile((current) => ({ ...current, messaging: { ...current.messaging, ...data.messaging } }));
      showToast('Messaging settings updated');
    } catch (err) { showToast(err.message, 'error'); throw err; }
  }

  async function toggleQuickBooksAccess(enabled) {
    setSaving(true);
    try {
      const data = await apiFetch(`/admin/accounts/${accountId}/quickbooks-access`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
      setProfile((current) => ({ ...current, quickBooks: { ...current.quickBooks, ...data.quickBooks } }));
      showToast(`QuickBooks access ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  async function saveQuickBooksPilot(input) {
    const data = await apiFetch(`/admin/accounts/${accountId}/quickbooks-pilot`, { method: 'PATCH', body: JSON.stringify(input) });
    setProfile((current) => ({ ...current, quickBooks: { ...current.quickBooks, pilot: data.pilot } }));
    showToast('QuickBooks pilot workflow updated');
  }

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!profile) return <div className="text-sm text-slate-400">Loading profile…</div>;
  const status = profile.disabledAt ? 'Disabled' : !profile.approvedAt ? 'Needs approval' : 'Active';

  return <div className="space-y-5">
    <div><Link to="/admin/accounts" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">← Back to accounts</Link><div className="mt-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold text-slate-800">{displayName}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'Disabled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{status}</span>{profile.isDesignPartner && <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">Design Partner</span>}{dueFollowUps > 0 && <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white">{dueFollowUps} follow-up{dueFollowUps === 1 ? '' : 's'} due</span>}</div><p className="mt-1 text-sm text-slate-500">{owner?.user.email} · Account since {new Date(profile.createdAt).toLocaleDateString()}</p></div></div></div>
    <div className="overflow-x-auto border-b border-slate-200"><div className="flex min-w-max gap-1">{TABS.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>{label}{id === 'notes' && profile.notes.length > 0 && <span className="ml-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{profile.notes.length}</span>}</button>)}</div></div>

    {tab === 'overview' && <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Team users" value={profile.members.length} detail={`${profile.planTier || profile.signupPlan || 'No plan'} plan`} /><Stat label="Bookings" value={profile.dataSummary.bookings} /><Stat label="Events" value={profile.dataSummary.events} /><Stat label="Support" value={(profile.supportSummary.open || 0) + (profile.supportSummary.closed || 0)} detail={`${profile.supportSummary.open || 0} open`} /></div>
      <div className="grid md:grid-cols-2 gap-5"><section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-800">Business profile</h3><dl className="mt-4 grid sm:grid-cols-2 gap-5"><Info label="Business name">{profile.business.name}</Info><Info label="Business type">{VERTICAL_LABELS[profile.vertical] || profile.vertical}{profile.allVerticalsEnabled ? ' · All types enabled' : ''}</Info><Info label="Business email">{profile.business.email}</Info><Info label="Business phone">{profile.business.phone}</Info><Info label="Address">{profile.business.address}</Info><Info label="Owner">{owner ? `${owner.user.firstName} ${owner.user.lastName}` : ''}</Info></dl></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-800">Plan and acquisition</h3><dl className="mt-4 grid sm:grid-cols-2 gap-5"><Info label="Current plan">{profile.planTier || profile.signupPlan || 'No plan'}</Info><Info label="Billing">{profile.billingInterval || profile.signupInterval || 'Not selected'}</Info><Info label="Subscription">{profile.subscriptionStatus || 'Not started'}</Info><Info label="Trial ends">{profile.trialEndsAt ? new Date(profile.trialEndsAt).toLocaleDateString() : '—'}</Info><Info label="Signup source">{profile.signupSource === 'public' ? 'Website' : 'Admin invitation'}</Info><Info label="Stripe payments">{profile.stripeConnected ? (profile.stripeChargesEnabled ? 'Connected and active' : 'Connected, action needed') : 'Not connected'}</Info></dl></section></div>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h3 className="font-bold text-slate-800">Plan access</h3><p className="text-sm text-slate-500 mt-1">Agency activates managed groups and custom branding without self-service Stripe pricing.</p></div><select aria-label="Account plan" value={profile.planTier || ''} onChange={(event) => changePlan(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"><option value="" disabled>Select plan</option><option value="solo">Solo</option><option value="team">Team</option><option value="studio">Studio</option><option value="agency">Agency</option></select></div></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-800">Data footprint</h3><div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm"><Info label="Clients">{profile.dataSummary.clients}</Info><Info label="Contractors">{profile.dataSummary.contractors}</Info><Info label="Bookings">{profile.dataSummary.bookings}</Info><Info label="Events">{profile.dataSummary.events}</Info></div></section>
      {profile.isDesignPartner && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-800">Design Partner Agreements</h3>
          <p className="text-sm text-slate-500 mt-1">{profile.agreementsSignedAt ? `Both agreements signed ${new Date(profile.agreementsSignedAt).toLocaleDateString()}.` : 'Waiting on the account holder to sign both agreements.'}</p>
          {profile.freeAccessExpiresAt && (
            <p className="text-sm text-slate-500 mt-1">
              Free access {new Date(profile.freeAccessExpiresAt) <= new Date() ? 'ended' : 'until'} {new Date(profile.freeAccessExpiresAt).toLocaleDateString()}
              {profile.designPartnerExpiryNotifiedAt && ` · 30-day notice sent ${new Date(profile.designPartnerExpiryNotifiedAt).toLocaleDateString()}`}
            </p>
          )}
          <div className="mt-4 divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {profile.designPartnerAgreements.map((agreement) => (
              <div key={agreement.id} data-testid="admin-account-agreement-row" className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{AGREEMENT_TYPE_LABELS[agreement.type] || agreement.type}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {agreement.signedAt
                      ? `Signed ${new Date(agreement.signedAt).toLocaleDateString()} by ${agreement.signatureName} · obligations active until ${new Date(agreement.expiresAt).toLocaleDateString()}`
                      : 'Pending signature'}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  <button type="button" onClick={() => setViewingAgreement(agreement)} data-testid="admin-account-agreement-view-button" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">View</button>
                  <Link to={`/admin/accounts/${accountId}/agreements/${agreement.id}/print`} target="_blank" data-testid="admin-account-agreement-print-link" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">Print</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>}

    {tab === 'team' && <section className="rounded-xl border border-slate-200 bg-white overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">Account users</h3><p className="text-sm text-slate-500 mt-1">Every person with access to this business account.</p></div><div className="divide-y divide-slate-100">{profile.members.map((member) => <div key={member.id} className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-semibold text-slate-800">{member.user.firstName} {member.user.lastName}</p><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">{member.role}</span>{!member.user.hasPassword && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Invite pending</span>}</div><p className="text-sm text-slate-500 mt-1">{member.user.email}{member.user.phone ? ` · ${member.user.phone}` : ''}</p></div><div className="text-xs text-slate-400">Joined {new Date(member.joinedAt).toLocaleDateString()}</div></div>)}</div></section>}

    {tab === 'messaging' && <AdminMessagingPanel messaging={profile.messaging} onSave={saveMessaging} />}

    {tab === 'quickbooks' && <div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-bold text-slate-800">QuickBooks pilot access</h3><p className="mt-1 max-w-2xl text-sm text-slate-500">Enable this only for approved pilot accounts. Disabling access prevents new connections and synchronization but preserves existing QuickBooks records and audit history.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${profile.quickBooks?.health === 'healthy' ? 'bg-emerald-100 text-emerald-700' : ['connection_issue', 'needs_attention'].includes(profile.quickBooks?.health) ? 'bg-amber-100 text-amber-800' : profile.quickBooks?.accessEnabled ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{profile.quickBooks?.health === 'healthy' ? 'Healthy' : profile.quickBooks?.health === 'needs_attention' ? 'Needs attention' : profile.quickBooks?.health === 'connection_issue' ? 'Connection issue' : profile.quickBooks?.accessEnabled ? 'Pilot enabled' : 'Disabled'}</span></div><div className="mt-5 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3"><Info label="Connected company">{profile.quickBooks?.companyName || (profile.quickBooks?.connected ? 'Connected' : 'Not connected')}</Info><Info label="Access enabled">{profile.quickBooks?.accessEnabledAt ? new Date(profile.quickBooks.accessEnabledAt).toLocaleString() : '—'}</Info><Info label="Connection checked">{profile.quickBooks?.lastHealthCheckAt ? new Date(profile.quickBooks.lastHealthCheckAt).toLocaleString() : '—'}</Info><Info label="Last successful sync">{profile.quickBooks?.lastSuccessfulSyncAt ? new Date(profile.quickBooks.lastSuccessfulSyncAt).toLocaleString() : '—'}</Info><Info label="Reconciliation">{profile.quickBooks?.lastReconciliationStatus || 'Not run'}</Info><Info label="Open sync issues">{profile.quickBooks?.issueCount || 0}</Info></div>{profile.quickBooks?.lastError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Connection error:</strong> {profile.quickBooks.lastError}</div>}<div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={saving || profile.quickBooks?.accessEnabled} onClick={() => toggleQuickBooksAccess(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Enable pilot access</button><button type="button" disabled={saving || !profile.quickBooks?.accessEnabled} onClick={() => { if (window.confirm('Disable QuickBooks access for this account? Existing QuickBooks records will not be deleted.')) toggleQuickBooksAccess(false); }} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-40">Disable access</button></div></section><AdminQuickBooksPilotPanel quickBooks={profile.quickBooks} onSave={saveQuickBooksPilot} /><section className="rounded-xl border border-slate-200 bg-white p-5"><div><h3 className="font-bold text-slate-800">Items needing attention</h3><p className="mt-1 text-sm text-slate-500">The customer can retry failed items from Settings → Integrations. Review items require a deliberate matching or reconciliation decision.</p></div><div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">{!profile.quickBooks?.recentIssues?.length ? <p className="p-6 text-center text-sm text-slate-400">No unresolved QuickBooks issues.</p> : profile.quickBooks.recentIssues.map((issue) => <div key={issue.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">{issue.displayName || issue.entityType}</p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${issue.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{issue.status === 'failed' ? 'Retry needed' : 'Review needed'}</span></div><p className="mt-1 text-xs capitalize text-slate-500">{issue.entityType.replaceAll('_', ' ')}</p>{issue.lastError && <p className="mt-1 text-sm text-slate-600">{issue.lastError}</p>}</div><p className="text-xs text-slate-400 sm:text-right">Updated {new Date(issue.updatedAt).toLocaleString()}</p></div>)}</div></section></div>}

        {tab === 'notes' && <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-5 items-start"><form onSubmit={addNote} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 lg:sticky lg:top-4"><div><h3 className="font-bold text-slate-800">Add internal note</h3><p className="text-xs text-slate-500 mt-1">Visible only to platform admins. Notes are retained as written.</p></div><div><label className="block text-xs font-semibold text-slate-500 mb-1">Category</label><select value={note.category} onChange={(e) => setNote((current) => ({ ...current, category: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label className="block text-xs font-semibold text-slate-500 mb-1">Note</label><textarea required rows={6} maxLength={5000} value={note.body} onChange={(e) => setNote((current) => ({ ...current, body: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Add context, a decision, or the next step…" /></div><div><label className="block text-xs font-semibold text-slate-500 mb-1">Follow-up date (optional)</label><input type="datetime-local" value={note.followUpAt} onChange={(e) => setNote((current) => ({ ...current, followUpAt: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={note.pinned} onChange={(e) => setNote((current) => ({ ...current, pinned: e.target.checked }))} />Pin this note</label><button disabled={saving} className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Adding…' : 'Add note'}</button></form><section className="space-y-3">{profile.notes.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">No internal notes yet.</div>}{profile.notes.map((item) => <article key={item.id} className={`rounded-xl border bg-white p-4 ${item.pinned ? 'border-amber-300 shadow-sm' : 'border-slate-200'}`}><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${CATEGORY_STYLES[item.category]}`}>{CATEGORY_LABELS[item.category]}</span>{item.pinned && <span className="text-xs text-amber-600">📌 Pinned</span>}{item.followUpAt && <span className={`text-xs font-semibold ${new Date(item.followUpAt) <= new Date() ? 'text-red-600' : 'text-slate-500'}`}>Follow up {new Date(item.followUpAt).toLocaleString()}</span>}</div><button type="button" onClick={() => togglePinned(item)} className="text-xs font-semibold text-slate-500 hover:text-indigo-600">{item.pinned ? 'Unpin' : 'Pin'}</button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{item.body}</p><p className="mt-3 text-[11px] text-slate-400">{item.author ? `${item.author.firstName} ${item.author.lastName}` : 'Former admin'} · {new Date(item.createdAt).toLocaleString()}</p></article>)}</section></div>}

    {tab === 'history' && <section className="rounded-xl border border-slate-200 bg-white p-5"><div><h3 className="font-bold text-slate-800">Account history</h3><p className="text-sm text-slate-500 mt-1">System-generated events are immutable and retained for operational context.</p></div><div className="mt-6 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200 space-y-5">{profile.activities.map((activity) => <div key={activity.id} className="relative pl-7"><span className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-indigo-500 shadow ring-1 ring-slate-200" /><p className="text-sm font-semibold text-slate-800">{activity.summary}</p><p className="mt-0.5 text-xs text-slate-400">{new Date(activity.createdAt).toLocaleString()}{activity.actor ? ` · ${activity.actor.firstName} ${activity.actor.lastName}` : ' · System'}</p>{activity.metadata?.reason && <p className="mt-1 text-xs text-slate-500">Reason: {activity.metadata.reason}</p>}</div>)}</div></section>}

    <Modal open={!!viewingAgreement} onClose={() => setViewingAgreement(null)} title={viewingAgreement ? (AGREEMENT_TYPE_LABELS[viewingAgreement.type] || viewingAgreement.type) : ''} widthClass="max-w-2xl">
      {viewingAgreement && (
        <div className="space-y-4">
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-slate-600 leading-relaxed border border-slate-200 rounded-lg p-4">{viewingAgreement.documentText}</div>
          {viewingAgreement.signedAt ? (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Signed {new Date(viewingAgreement.signedAt).toLocaleString()} by {viewingAgreement.signatureName}</p>
              {viewingAgreement.signatureImage && <img src={viewingAgreement.signatureImage} alt={`${viewingAgreement.signatureName}'s signature`} className="h-20 border border-slate-200 rounded-lg bg-white" />}
            </div>
          ) : (
            <p className="text-sm font-semibold text-amber-600">Not yet signed.</p>
          )}
          <Link to={`/admin/accounts/${accountId}/agreements/${viewingAgreement.id}/print`} target="_blank" className="inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-700">Open printable version →</Link>
        </div>
      )}
    </Modal>
  </div>;
}

function AdminQuickBooksPilotPanel({ quickBooks, onSave }) {
  const { accountId } = useParams();
  const pilot = quickBooks?.pilot || {};
  const [form, setForm] = useState({ status: pilot.status || 'onboarding', supportStatus: pilot.supportStatus || 'open', feedback: pilot.feedback || '', nextFollowUpAt: pilot.nextFollowUpAt ? new Date(pilot.nextFollowUpAt).toISOString().slice(0, 16) : '', assignedToMe: undefined, reviewed: !!pilot.reviewedAt, approved: !!pilot.approvedAt, onboardingCompleted: !!pilot.onboardingCompletedAt, documentationShared: !!pilot.documentationSharedAt, firstCycleCompleted: !!pilot.firstCycleCompletedAt, secondCycleCompleted: !!pilot.secondCycleCompletedAt });
  const [savingPilot, setSavingPilot] = useState(false);
  const milestones = [
    ['Pilot access enabled', !!quickBooks?.accessEnabled, quickBooks?.accessEnabledAt],
    ['QuickBooks connected', !!quickBooks?.connected, quickBooks?.lastHealthCheckAt],
    ['First successful sync', !!quickBooks?.lastSuccessfulSyncAt, quickBooks?.lastSuccessfulSyncAt],
    [<label key="onboarding" className="flex items-center gap-2"><input type="checkbox" checked={form.onboardingCompleted} onChange={(event) => setForm((current) => ({ ...current, onboardingCompleted: event.target.checked }))} />Customer onboarding completed</label>, !!pilot.onboardingCompletedAt, pilot.onboardingCompletedAt],
    [<label key="documentation" className="flex items-center gap-2"><input type="checkbox" checked={form.documentationShared} onChange={(event) => setForm((current) => ({ ...current, documentationShared: event.target.checked }))} />Support guide shared</label>, !!pilot.documentationSharedAt, pilot.documentationSharedAt],
    [<label key="cycle-one" className="flex items-center gap-2"><input type="checkbox" checked={form.firstCycleCompleted} onChange={(event) => setForm((current) => ({ ...current, firstCycleCompleted: event.target.checked }))} />First accounting cycle monitored</label>, !!pilot.firstCycleCompletedAt, pilot.firstCycleCompletedAt],
    [<label key="cycle-two" className="flex items-center gap-2"><input type="checkbox" checked={form.secondCycleCompleted} onChange={(event) => setForm((current) => ({ ...current, secondCycleCompleted: event.target.checked }))} />Second accounting cycle monitored</label>, !!pilot.secondCycleCompletedAt, pilot.secondCycleCompletedAt],
    ['Pilot reviewed', !!pilot.reviewedAt, pilot.reviewedAt],
    ['Approved to graduate', !!pilot.approvedAt, pilot.approvedAt],
  ];
  async function submit(event) {
    event.preventDefault(); setSavingPilot(true);
    try { await onSave({ ...form, nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : null }); }
    finally { setSavingPilot(false); }
  }
  return <div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5"><div><h3 className="font-bold text-slate-800">Pilot milestones and support</h3><p className="mt-1 text-sm text-slate-500">Keep ownership, customer follow-up, and graduation decisions in one operational checklist.</p></div><div className="mt-5 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]"><div className="space-y-2">{milestones.map(([label, complete, date]) => <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5"><div className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${complete ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{complete ? '✓' : '·'}</span><span className="text-sm font-semibold text-slate-700">{label}</span></div>{date && <span className="text-xs text-slate-400">{new Date(date).toLocaleDateString()}</span>}</div>)}</div><form onSubmit={submit} className="space-y-4 rounded-lg bg-slate-50 p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-600">Pilot stage<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="onboarding">Onboarding</option><option value="active">Active pilot</option><option value="paused">Paused</option><option value="graduated">Graduated</option><option value="offboarded">Offboarded</option></select></label><label className="text-sm font-semibold text-slate-600">Support status<select value={form.supportStatus} onChange={(event) => setForm((current) => ({ ...current, supportStatus: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="open">Open</option><option value="waiting_customer">Waiting on customer</option><option value="resolved">Resolved</option></select></label></div><label className="block text-sm font-semibold text-slate-600">Next follow-up<input type="datetime-local" value={form.nextFollowUpAt} onChange={(event) => setForm((current) => ({ ...current, nextFollowUpAt: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label><label className="block text-sm font-semibold text-slate-600">Customer feedback and requested improvements<textarea rows={4} maxLength={10000} value={form.feedback} onChange={(event) => setForm((current) => ({ ...current, feedback: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" placeholder="Record feedback, decisions, and the next action…" /></label><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.reviewed} onChange={(event) => setForm((current) => ({ ...current, reviewed: event.target.checked }))} />Pilot reviewed</label><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.approved} onChange={(event) => setForm((current) => ({ ...current, approved: event.target.checked }))} />Approved to graduate</label></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setForm((current) => ({ ...current, assignedToMe: pilot.owner ? false : true }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600">{pilot.owner ? `Unassign ${pilot.owner.firstName}` : 'Assign to me'}</button><button disabled={savingPilot || !quickBooks?.accessEnabled} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingPilot ? 'Saving…' : 'Save pilot workflow'}</button></div>{!quickBooks?.accessEnabled && <p className="text-xs text-amber-700">Enable pilot access before saving this workflow.</p>}</form></div></section><AdminQuickBooksTestRunner accountId={accountId} accessEnabled={quickBooks?.accessEnabled} initialRuns={pilot.testRuns || []} /></div>;
}

const PILOT_TEST_STEPS = [
  ['connection', 'Connection and authorization', 'Confirm the intended QuickBooks company connects and passes its health check.'],
  ['customer_invoice', 'Customer and invoice', 'Match or create a customer, then sync one complete invoice.'],
  ['client_payment', 'Client payment', 'Sync a payment and confirm it links to the correct invoice without duplication.'],
  ['vendor_bill', 'Contractor vendor and bill', 'Match or create a vendor, then sync the contractor bill to the correct gig.'],
  ['contractor_payment', 'Contractor payment', 'Sync the recorded payment and confirm it links to the correct bill.'],
  ['duplicate_protection', 'Duplicate protection', 'Repeat a safe sync and confirm no duplicate accounting record is created.'],
  ['reconciliation', 'Reconciliation', 'Run verification and resolve or document every mismatch.'],
];

function AdminQuickBooksTestRunner({ accountId, accessEnabled, initialRuns }) {
  const { showToast } = useToast();
  const [runs, setRuns] = useState(initialRuns || []);
  const [savingStep, setSavingStep] = useState('');
  const active = runs.find((run) => run.status === 'in_progress') || runs[0] || null;
  async function startRun() {
    try {
      const data = await apiFetch(`/admin/accounts/${accountId}/quickbooks-pilot-tests`, { method: 'POST' });
      setRuns((current) => [data.run, ...current]);
      showToast('Controlled pilot test started');
    } catch (error) { showToast(error.message, 'error'); }
  }
  async function saveStep(step, result, evidence) {
    if (!active) return;
    setSavingStep(step);
    try {
      const data = await apiFetch(`/admin/accounts/${accountId}/quickbooks-pilot-tests/${active.id}`, { method: 'PATCH', body: JSON.stringify({ step, result, evidence }) });
      setRuns((current) => current.map((run) => run.id === data.run.id ? data.run : run));
      showToast(result === 'passed' ? 'Test step passed' : result === 'failed' ? 'Test issue recorded' : 'Test step reset');
    } catch (error) { showToast(error.message, 'error'); }
    finally { setSavingStep(''); }
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">Controlled pilot test</h3><p className="mt-1 text-sm text-slate-500">Record evidence for one end-to-end accounting workflow. Failed steps prevent the run from passing.</p></div><button type="button" disabled={!accessEnabled || !!runs.find((run) => run.status === 'in_progress')} onClick={startRun} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Start new test</button></div>{!active ? <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No pilot test has been started.</div> : <div className="mt-4"><div className="mb-3 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${active.status === 'passed' ? 'bg-emerald-100 text-emerald-700' : active.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>{active.status === 'in_progress' ? 'In progress' : active.status === 'passed' ? 'Passed' : 'Failed'}</span><span className="text-xs text-slate-400">Started {new Date(active.startedAt).toLocaleString()}{active.testedBy ? ` by ${active.testedBy.firstName} ${active.testedBy.lastName}` : ''}</span></div><div className="space-y-3">{PILOT_TEST_STEPS.map(([key, label, description]) => <PilotTestStep key={key} stepKey={key} label={label} description={description} value={active.results?.[key]} disabled={savingStep === key || active.status !== 'in_progress'} onSave={saveStep} />)}</div>{active.completedAt && <p className="mt-4 text-xs font-semibold text-slate-500">Completed {new Date(active.completedAt).toLocaleString()}. Start a new run to retest without changing this record.</p>}</div>}</section>;
}

function PilotTestStep({ stepKey, label, description, value, disabled, onSave }) {
  const [evidence, setEvidence] = useState(value?.evidence || '');
  const result = value?.result || 'pending';
  return <div className={`rounded-lg border p-4 ${result === 'passed' ? 'border-emerald-200 bg-emerald-50/40' : result === 'failed' ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-800">{label}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${result === 'passed' ? 'bg-emerald-100 text-emerald-700' : result === 'failed' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{result === 'passed' ? 'Passed' : result === 'failed' ? 'Failed' : 'Not tested'}</span></div><textarea rows={2} maxLength={2000} value={evidence} disabled={disabled} onChange={(event) => setEvidence(event.target.value)} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50" placeholder="Add the QuickBooks record number, result, or issue details…" /><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={disabled} onClick={() => onSave(stepKey, 'passed', evidence)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Pass</button><button type="button" disabled={disabled} onClick={() => onSave(stepKey, 'failed', evidence)} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-40">Record issue</button>{result !== 'pending' && <button type="button" disabled={disabled} onClick={() => onSave(stepKey, 'pending', evidence)} className="px-3 py-1.5 text-xs font-semibold text-slate-500 disabled:opacity-40">Reset</button>}</div></div>;
}

function AdminMessagingPanel({ messaging, onSave }) {
  const [form, setForm] = useState({ status: messaging?.status === 'not_started' ? 'pending' : messaging?.status || 'pending', phoneNumber: messaging?.phoneNumber || '', providerNumberSid: '', messagingServiceSid: '', monthlyMessageLimit: messaging?.monthlyMessageLimit || 500, internalNote: messaging?.internalNote || '' });
  const [saving, setSaving] = useState(false);
  async function submit(event) { event.preventDefault(); setSaving(true); try { await onSave(form); } finally { setSaving(false); } }
  return <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr] items-start"><form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"><div><h3 className="font-bold text-slate-800">Dedicated number provisioning</h3><p className="mt-1 text-sm text-slate-500">After carrier approval, assign the Twilio number and activate messaging for this account.</p></div><label className="block text-sm font-semibold text-slate-600">Status<select value={form.status} onChange={(e) => setForm((old) => ({ ...old, status: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="requested">Requested</option><option value="pending">Carrier review</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="rejected">Action needed</option></select></label><label className="block text-sm font-semibold text-slate-600">Dedicated phone number<input value={form.phoneNumber} onChange={(e) => setForm((old) => ({ ...old, phoneNumber: e.target.value }))} placeholder="+1 212 555 0100" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold text-slate-600">Twilio number SID<input value={form.providerNumberSid} onChange={(e) => setForm((old) => ({ ...old, providerNumberSid: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-semibold text-slate-600">Messaging Service SID<input value={form.messagingServiceSid} onChange={(e) => setForm((old) => ({ ...old, messagingServiceSid: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label></div><label className="block text-sm font-semibold text-slate-600">Monthly message allowance<input type="number" min="1" value={form.monthlyMessageLimit} onChange={(e) => setForm((old) => ({ ...old, monthlyMessageLimit: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-semibold text-slate-600">Internal provisioning note<textarea rows={4} value={form.internalNote} onChange={(e) => setForm((old) => ({ ...old, internalNote: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save messaging settings'}</button></form><section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-800">Customer request</h3><dl className="mt-4 space-y-4"><Info label="Status">{messaging?.status}</Info><Info label="Requested area code">{messaging?.areaCodePreference}</Info><Info label="Business name">{messaging?.businessName}</Info><Info label="Requested">{messaging?.requestedAt ? new Date(messaging.requestedAt).toLocaleString() : '—'}</Info><Info label="Usage">{messaging?.currentPeriodCount || 0} / {messaging?.monthlyMessageLimit || 'unlimited'}</Info></dl><div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-800">Configure the assigned Twilio number’s incoming-message webhook as <strong>/api/webhooks/twilio/sms/inbound</strong>. Gigworks supplies the delivery-status callback automatically.</div></section></div>;
}
