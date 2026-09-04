import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { getMessagingProfile, requestMessagingActivation } from '../../lib/messaging';

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'mb-1 block text-xs font-semibold text-slate-600';
const STATUS = {
  not_started: ['Not activated', 'bg-slate-100 text-slate-600'],
  requested: ['Request received', 'bg-amber-100 text-amber-700'],
  pending: ['Carrier review', 'bg-blue-100 text-blue-700'],
  active: ['Active', 'bg-emerald-100 text-emerald-700'],
  suspended: ['Suspended', 'bg-red-100 text-red-700'],
  rejected: ['Action needed', 'bg-red-100 text-red-700'],
};

export default function MessagingTab() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const business = currentUser.businessInfo || {};
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ businessName: business.name || '', businessWebsite: business.website || '', businessAddress: business.address || '', businessCity: business.city || '', businessRegion: business.state || '', businessPostalCode: business.zip || '', areaCodePreference: '', useCaseDescription: 'One-to-one operational messages to contractors about assigned gigs, schedules, confirmations, and payments.', consentAttested: false });

  useEffect(() => { getMessagingProfile().then((data) => { setProfile(data); setForm((old) => ({ ...old, businessName: data.businessName || old.businessName, businessWebsite: data.businessWebsite || old.businessWebsite, businessAddress: data.businessAddress || old.businessAddress, businessCity: data.businessCity || old.businessCity, businessRegion: data.businessRegion || old.businessRegion, businessPostalCode: data.businessPostalCode || old.businessPostalCode, areaCodePreference: data.areaCodePreference || old.areaCodePreference, useCaseDescription: data.useCaseDescription || old.useCaseDescription })); }).catch((error) => showToast(error.message, 'error')).finally(() => setLoading(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try { const updated = await requestMessagingActivation(form); setProfile(updated); showToast('Dedicated number request submitted'); }
    catch (error) { showToast(error.message || 'Unable to submit the request', 'error'); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading messaging settings…</p>;
  const [statusLabel, statusClass] = STATUS[profile?.status] || STATUS.not_started;
  if (profile?.status === 'active') return <div className="max-w-2xl space-y-5"><section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Dedicated Gigworks number</p><p className="mt-1 text-2xl font-bold text-slate-800">{profile.phoneDisplay}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass}`}>{statusLabel}</span></div><p className="mt-3 text-sm text-slate-600">Use the SMS button on any contractor strip. Replies and delivery status appear in that gig’s Contact History.</p></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-800">Monthly messaging</h3><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, ((profile.currentPeriodCount || 0) / (profile.monthlyMessageLimit || 1)) * 100)}%` }} /></div><p className="mt-2 text-sm text-slate-500">{profile.currentPeriodCount || 0} of {profile.monthlyMessageLimit || 'unlimited'} messages used</p></section></div>;

  return <form onSubmit={submit} className="max-w-2xl space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">Dedicated Gigworks phone number</h3><p className="mt-1 max-w-xl text-sm text-slate-500">Gigworks will provide and manage a business number for contractor texts. Your team will not need a Twilio account.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass}`}>{statusLabel}</span></div>{['requested', 'pending'].includes(profile?.status) && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">We are registering your business with the carriers. You can return here to see when the number is active.</div>}</section><section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"><div><h3 className="font-bold text-slate-800">Business registration</h3><p className="mt-1 text-sm text-slate-500">Carriers require this information for trusted operational messaging.</p></div><div className="grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Legal business name</span><input required value={form.businessName} onChange={(e) => setForm((old) => ({ ...old, businessName: e.target.value }))} className={inputClass} /></label><label><span className={labelClass}>Business website</span><input required type="url" placeholder="https://example.com" value={form.businessWebsite} onChange={(e) => setForm((old) => ({ ...old, businessWebsite: e.target.value }))} className={inputClass} /></label><label className="sm:col-span-2"><span className={labelClass}>Street address</span><input required value={form.businessAddress} onChange={(e) => setForm((old) => ({ ...old, businessAddress: e.target.value }))} className={inputClass} /></label><label><span className={labelClass}>City</span><input required value={form.businessCity} onChange={(e) => setForm((old) => ({ ...old, businessCity: e.target.value }))} className={inputClass} /></label><label><span className={labelClass}>State</span><input required value={form.businessRegion} onChange={(e) => setForm((old) => ({ ...old, businessRegion: e.target.value }))} className={inputClass} /></label><label><span className={labelClass}>ZIP code</span><input required value={form.businessPostalCode} onChange={(e) => setForm((old) => ({ ...old, businessPostalCode: e.target.value }))} className={inputClass} /></label><label><span className={labelClass}>Preferred area code</span><input inputMode="numeric" maxLength={3} placeholder="Optional" value={form.areaCodePreference} onChange={(e) => setForm((old) => ({ ...old, areaCodePreference: e.target.value.replace(/\D/g, '').slice(0, 3) }))} className={inputClass} /></label></div><label><span className={labelClass}>How you will use texting</span><textarea required rows={3} value={form.useCaseDescription} onChange={(e) => setForm((old) => ({ ...old, useCaseDescription: e.target.value }))} className={inputClass} /></label><label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><input required type="checkbox" checked={form.consentAttested} onChange={(e) => setForm((old) => ({ ...old, consentAttested: e.target.checked }))} className="mt-1" /><span>I will text contractors only about business operations and assigned gigs, will record their permission, and will honor opt-out requests.</span></label><button disabled={saving || ['requested', 'pending'].includes(profile?.status)} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Submitting…' : ['requested', 'pending'].includes(profile?.status) ? 'Request submitted' : 'Request my number'}</button></section></form>;
}
