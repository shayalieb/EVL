import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import SubmitButton from '../components/ui/SubmitButton';
import { getReviewRequest, submitReview } from '../lib/landing';

const inputClass = 'w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';
const labelClass = 'block text-sm font-semibold text-slate-700 mb-1.5';

export default function ReviewSubmissionPage() {
  const { token } = useParams();
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState({ reviewerName: '', groupName: '', groupType: '', rating: 5, quote: '', storyTitle: '', storySummary: '', storyBody: '', displayConsent: false });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    getReviewRequest(token).then((data) => { setRequest(data.request); setForm((current) => ({ ...current, reviewerName: data.request.recipientName || '', groupName: data.request.groupName || '' })); }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setSubmitting(true);
    try { await submitReview(token, form); setDone(true); }
    catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  let content;
  if (loading) content = <p className="text-sm text-slate-500">Loading your review form…</p>;
  else if (done) content = <div className="text-center py-8"><div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl">✓</div><h1 className="text-2xl font-bold text-slate-900 mt-5">Thank you for sharing</h1><p className="text-slate-500 mt-2">Your review has been submitted for approval. It will not appear publicly unless GigWorks approves and publishes it.</p></div>;
  else if (error && !request) content = <div className="text-center py-8"><h1 className="text-2xl font-bold text-slate-900">Review form unavailable</h1><p className="text-red-600 mt-2">{error}</p></div>;
  else if (request?.status && request.status !== 'open') content = <div className="text-center py-8"><h1 className="text-2xl font-bold text-slate-900">This link is no longer available</h1><p className="text-slate-500 mt-2">{request.status === 'expired' ? 'The review request has expired. Please ask GigWorks for a new link.' : 'A response has already been submitted through this link.'}</p></div>;
  else content = <><div className="mb-7"><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Customer feedback</p><h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">Share your GigWorks experience</h1><p className="text-sm text-slate-500 mt-2">Your honest feedback helps other entertainment professionals understand whether GigWorks fits their workflow.</p></div><form onSubmit={handleSubmit} className="space-y-5">
    <div className="grid sm:grid-cols-2 gap-4"><div><label htmlFor="reviewer-name" className={labelClass}>Your name <span className="font-normal text-slate-400">(optional)</span></label><input id="reviewer-name" className={inputClass} value={form.reviewerName} onChange={(e) => setForm((current) => ({ ...current, reviewerName: e.target.value }))} /></div><div><label htmlFor="group-name" className={labelClass}>Group or business name</label><input id="group-name" required className={inputClass} value={form.groupName} onChange={(e) => setForm((current) => ({ ...current, groupName: e.target.value }))} /></div></div>
    <div><label htmlFor="group-type" className={labelClass}>Type of business <span className="font-normal text-slate-400">(optional)</span></label><input id="group-type" className={inputClass} placeholder="Band, DJ company, booking agency…" value={form.groupType} onChange={(e) => setForm((current) => ({ ...current, groupType: e.target.value }))} /></div>
    <fieldset><legend className={labelClass}>Your rating</legend><div className="flex gap-1" role="radiogroup">{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" role="radio" aria-checked={form.rating === star} aria-label={`${star} star${star === 1 ? '' : 's'}`} onClick={() => setForm((current) => ({ ...current, rating: star }))} className={`text-3xl ${star <= form.rating ? 'text-amber-400' : 'text-slate-300'}`}>★</button>)}</div></fieldset>
    <div><label htmlFor="review-quote" className={labelClass}>Your review</label><textarea id="review-quote" required rows={5} maxLength={1200} className={inputClass} placeholder="What changed for your business? What has been most useful?" value={form.quote} onChange={(e) => setForm((current) => ({ ...current, quote: e.target.value }))} /><p className="text-right text-xs text-slate-400 mt-1">{form.quote.length}/1200</p></div>
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer font-semibold text-slate-700">Share a longer customer story <span className="font-normal text-slate-400">(optional)</span></summary><div className="space-y-4 mt-4"><div><label htmlFor="story-title" className={labelClass}>Story title</label><input id="story-title" className={inputClass} value={form.storyTitle} onChange={(e) => setForm((current) => ({ ...current, storyTitle: e.target.value }))} /></div><div><label htmlFor="story-summary" className={labelClass}>Short summary</label><textarea id="story-summary" rows={2} className={inputClass} value={form.storySummary} onChange={(e) => setForm((current) => ({ ...current, storySummary: e.target.value }))} /></div><div><label htmlFor="story-body" className={labelClass}>Your story</label><textarea id="story-body" rows={7} className={inputClass} placeholder="What were you using before, what problem were you solving, and what results have you seen?" value={form.storyBody} onChange={(e) => setForm((current) => ({ ...current, storyBody: e.target.value }))} /></div></div></details>
    <label className="flex items-start gap-3 rounded-xl bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-950"><input type="checkbox" required checked={form.displayConsent} onChange={(e) => setForm((current) => ({ ...current, displayConsent: e.target.checked }))} className="mt-0.5 h-4 w-4" /><span>I give GigWorks permission to display this review, my group or business name, star rating, and any optional story I submitted. I understand it will be reviewed before publication.</span></label>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <SubmitButton loading={submitting}>Submit review</SubmitButton>
  </form></>;

  return <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-950 to-fuchsia-950 px-4 py-8 sm:py-12"><div className="max-w-2xl mx-auto"><Link to="/" className="block w-fit mx-auto mb-7 rounded-xl bg-white px-4 py-3 shadow-lg"><Logo className="h-9 w-auto" /></Link><main className="rounded-3xl bg-white p-6 sm:p-9 shadow-2xl">{content}</main></div></div>;
}
