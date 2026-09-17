import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import SubmitButton from '../components/ui/SubmitButton';
import { getPublicPrepForm, submitPublicPrepForm } from '../lib/prepForms';
import { formatEventDate } from '../lib/format';

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const blankItem = () => ({ name: '', details: '', link: '', prompted: false });

function BusinessLogo({ info }) {
  return info?.logo ? <img src={info.logo} alt={info.name || ''} className="max-h-14 max-w-56 object-contain" /> : info?.name ? <p className="text-xl font-bold text-slate-800">{info.name}</p> : <Logo className="h-9 w-auto" />;
}

export default function PrepRequestPage() {
  const { token } = useParams();
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState({ submitterName: '', items: [blankItem()], notes: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getPublicPrepForm(token).then((data) => {
      setMeta(data);
      if (data.prompts?.length) setForm((old) => ({ ...old, items: data.prompts.map((item) => ({ name: item.name, details: '', link: '', prompted: true })) }));
    }).catch((err) => setError(err.message || 'This form is unavailable.')).finally(() => setLoading(false));
  }, [token]);

  function updateItem(index, field, value) { setForm((old) => ({ ...old, items: old.items.map((item, i) => i === index ? { ...item, [field]: value } : item) })); }
  async function submit(event) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try { await submitPublicPrepForm(token, { ...form, items: form.items.filter((item) => !item.prompted || item.details.trim() || item.link.trim()) }); setSubmitted(true); }
    catch (err) { setError(err.message || 'Your requests could not be submitted.'); }
    finally { setSubmitting(false); }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Logo className="h-10 w-auto" /></div>;
  if (error && !meta) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-xl"><Logo className="mx-auto h-10 w-auto" /><p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p></div></div>;
  const bandName = meta?.businessInfo?.name || 'the band';
  if (submitted) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-xl"><BusinessLogo info={meta.businessInfo} /><h1 className="mt-6 text-xl font-bold text-slate-900">Thank you</h1><p className="mt-2 text-sm text-slate-600">Your requests were added to the prep sheet for {meta.event.name || 'your event'}.</p><p className="mt-4 text-sm text-slate-500">If you would like to discuss anything over the phone, please reach out to {bandName}.</p></div></div>;

  return <div className="min-h-screen bg-slate-50 px-3 py-8"><form onSubmit={submit} className="mx-auto w-full max-w-2xl space-y-6 rounded-2xl bg-white p-5 shadow-xl sm:p-8">
    <div><BusinessLogo info={meta.businessInfo} /><h1 className="mt-6 text-2xl font-bold text-slate-900">Event requests and preparation details</h1><p className="mt-2 text-sm text-slate-600">{meta.event.name}{meta.event.eventDate ? ` · ${formatEventDate(meta.event.eventDate)}` : ''}{meta.event.venueName ? ` · ${meta.event.venueName}` : ''}</p><p className="mt-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800">Use this form to share requests and other information. If you want to discuss anything over the phone, please reach out to {bandName}.</p></div>
    <label className="block text-sm font-semibold text-slate-700">Your name *<input required value={form.submitterName} onChange={(e) => setForm((old) => ({ ...old, submitterName: e.target.value }))} className={`${inputClass} mt-1`} /></label>
    <section><div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">Request line items</h2><button type="button" onClick={() => setForm((old) => ({ ...old, items: [...old.items, blankItem()] }))} className="text-sm font-semibold text-indigo-600">+ Add request</button></div><div className="mt-3 space-y-3">{form.items.map((item, index) => <div key={index} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Request {index + 1}</p>{form.items.length > 1 && <button type="button" onClick={() => setForm((old) => ({ ...old, items: old.items.filter((_, i) => i !== index) }))} className="text-xs font-semibold text-rose-600">Remove</button>}</div><div className="mt-3 space-y-3"><input value={item.name} onChange={(e) => updateItem(index, 'name', e.target.value)} placeholder="Request or item name" className={inputClass} /><textarea rows={3} value={item.details} onChange={(e) => updateItem(index, 'details', e.target.value)} placeholder="Details, preferences, versions, timing, or anything else we should know" className={inputClass} /><input type="url" value={item.link} onChange={(e) => updateItem(index, 'link', e.target.value)} placeholder="Reference link (optional)" className={inputClass} /></div></div>)}</div></section>
    <label className="block text-sm font-semibold text-slate-700">Additional notes<textarea rows={4} value={form.notes} onChange={(e) => setForm((old) => ({ ...old, notes: e.target.value }))} placeholder="Other information for the prep sheet" className={`${inputClass} mt-1`} /></label>
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <SubmitButton loading={submitting}>Submit to prep sheet</SubmitButton>
    <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400"><span>Powered by</span><Logo className="h-4 w-auto" /></div>
  </form></div>;
}
