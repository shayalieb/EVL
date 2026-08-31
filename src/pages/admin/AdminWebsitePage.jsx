import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';
const TABS = [
  ['launch', 'Launch'], ['hero', 'Navigation & Hero'], ['story', 'Story'], ['problems', 'Problems'],
  ['features', 'Features'], ['agency', 'Agency Tier'], ['reviews', 'Reviews & Stories'], ['pricing', 'Pricing'], ['faq', 'FAQ'], ['forms', 'Forms & Footer'], ['legal', 'Legal'],
];

// Keep in sync with server/src/lib/websiteConfig.js's ICON_KEYS and
// src/components/ui/icons.jsx's exports.
const ICON_OPTIONS = [
  ['file', 'Document'], ['users', 'People'], ['clipboard', 'Clipboard'], ['bell', 'Bell'],
  ['calendar', 'Calendar'], ['clock', 'Clock'], ['dollar', 'Dollar'], ['wrench', 'Wrench'],
  ['alert', 'Alert'], ['info', 'Info'], ['mappin', 'Map Pin'], ['note', 'Note'], ['search', 'Search'],
  ['star', 'Star'], ['shield', 'Shield'], ['chart', 'Chart'], ['bolt', 'Bolt'],
];

function Field({ label, value, onChange, rows = 0, type = 'text', min, max, step }) {
  const props = { value, onChange: (e) => onChange(e.target.value), className: inputClass };
  return <div><label className={labelClass}>{label}</label>{rows ? <textarea rows={rows} {...props} /> : <input type={type} min={min} max={max} step={step} {...props} />}</div>;
}

function Card({ title, children }) {
  return <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"><h3 className="font-bold text-slate-800">{title}</h3>{children}</section>;
}

function StringList({ items, onChange, label = 'Items' }) {
  return (
    <div className="space-y-2">
      <label className={labelClass}>{label}</label>
      {items.map((item, index) => (
        <div key={index} className="flex gap-2 items-center">
          <input className={`${inputClass} flex-1`} value={item} onChange={(e) => onChange(items.map((current, i) => i === index ? e.target.value : current))} />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            disabled={items.length <= 1}
            aria-label={`Remove item ${index + 1}`}
            className="shrink-0 px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ''])} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">+ Add item</button>
    </div>
  );
}

export default function AdminWebsitePage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(() => TABS.some(([id]) => id === searchParams.get('tab')) ? searchParams.get('tab') : 'launch');
  const [reviewRequests, setReviewRequests] = useState([]);
  const [requestForm, setRequestForm] = useState({ recipientName: '', recipientEmail: '', groupName: '' });
  const [requestBusy, setRequestBusy] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch('/admin/website/config'), apiFetch('/admin/website/review-requests')])
      .then(([configData, requestData]) => { setConfig(configData.config); setReviewRequests(requestData.requests); })
      .catch((err) => setError(err.message));
  }, []);

  function updateSection(section, key, value) { setConfig((current) => ({ ...current, [section]: { ...current[section], [key]: value } })); }
  function updateNested(section, collection, index, key, value) {
    setConfig((current) => ({ ...current, [section]: { ...current[section], [collection]: current[section][collection].map((item, i) => i === index ? { ...item, [key]: value } : item) } }));
  }
  function updateTier(index, key, value) { updateNested('pricing', 'tiers', index, key, value); }
  function updateTierDollars(index, key, value) { const cents = Math.round(Number(value) * 100); updateTier(index, key, Number.isFinite(cents) ? cents : 0); }
  function updateComparison(key, value) { updateSection('features', 'comparison', { ...config.features.comparison, [key]: value }); }
  function updateComparisonCategory(categoryIndex, updater) {
    updateComparison('categories', config.features.comparison.categories.map((category, index) => index === categoryIndex ? updater(category) : category));
  }
  function addComparisonCategory() {
    const id = `category-${Date.now()}`;
    updateComparison('categories', [...config.features.comparison.categories, { id, name: 'New category', rows: [{ id: `${id}-feature-1`, feature: 'New feature', solo: 'Included', team: 'Included', studio: 'Included', agency: 'Included' }] }]);
  }
  function addFeatureGroup() {
    updateSection('features', 'groups', [...config.features.groups, { id: `feature-${Date.now()}`, icon: 'file', title: 'New feature', items: ['New benefit'] }]);
  }
  function removeFeatureGroup(index) {
    updateSection('features', 'groups', config.features.groups.filter((_, i) => i !== index));
  }
  function addReview() {
    updateSection('testimonials', 'reviews', [...config.testimonials.reviews, {
      id: `review-${Date.now()}`, groupName: 'New customer group', reviewerName: '', groupType: '', quote: 'Add the customer review here.', rating: 5,
      published: false, featured: false, storyPublished: false, storyTitle: '', storySummary: '', storyBody: '',
    }]);
  }
  function updateReview(index, key, value) { updateNested('testimonials', 'reviews', index, key, value); }
  function removeReview(index) { updateSection('testimonials', 'reviews', config.testimonials.reviews.filter((_, i) => i !== index)); }
  async function createReviewRequest(sendEmail) {
    if (!requestForm.recipientEmail.trim()) return showToast('Enter the customer email first.', 'error');
    setRequestBusy(true);
    try {
      const data = await apiFetch('/admin/website/review-requests', { method: 'POST', body: JSON.stringify({ ...requestForm, sendEmail }) });
      setReviewRequests((current) => [data.request, ...current]);
      setRequestForm({ recipientName: '', recipientEmail: '', groupName: '' });
      if (data.emailError) showToast(data.emailError, 'error'); else showToast(sendEmail ? 'Review request emailed' : 'Review link created');
    } catch (err) { showToast(err.message, 'error'); } finally { setRequestBusy(false); }
  }
  async function copyReviewLink(link) {
    try { await navigator.clipboard.writeText(link); showToast('Review link copied'); }
    catch { showToast('Could not copy the link. Select and copy it manually.', 'error'); }
  }
  async function sendReviewRequest(id) {
    try { const data = await apiFetch(`/admin/website/review-requests/${id}/send`, { method: 'POST' }); setReviewRequests((current) => current.map((item) => item.id === id ? data.request : item)); showToast('Review request emailed'); }
    catch (err) { showToast(err.message, 'error'); }
  }
  async function moderateReview(id, decision) {
    try {
      const data = await apiFetch(`/admin/website/review-requests/${id}/${decision}`, { method: 'POST' });
      setReviewRequests((current) => current.map((item) => item.id === id ? data.request : item));
      if (data.config) setConfig(data.config);
      showToast(decision === 'approve' ? 'Review approved as an unpublished draft' : 'Review declined');
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function save(e) {
    e.preventDefault(); setSaving(true);
    try { const data = await apiFetch('/admin/website/config', { method: 'PUT', body: JSON.stringify({ config }) }); setConfig(data.config); showToast('Website settings published'); }
    catch (err) { showToast(err.message, 'error'); } finally { setSaving(false); }
  }

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!config) return <div className="text-sm text-slate-400">Loading…</div>;

  return (
    <form onSubmit={save} className="max-w-6xl space-y-5">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl font-bold text-slate-800">Website</h2><p className="text-sm text-slate-500 mt-1">Edit and publish every section of the public landing page.</p></div><button disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">{saving ? 'Publishing…' : 'Publish changes'}</button></div>
      <div className="overflow-x-auto border-b border-slate-200"><div className="flex min-w-max gap-1">{TABS.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}{id === 'reviews' && reviewRequests.some((item) => item.status === 'submitted') && <span className="ml-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] text-white">{reviewRequests.filter((item) => item.status === 'submitted').length}</span>}</button>)}</div></div>

      {tab === 'launch' && <Card title="Public signup"><div className="flex items-start justify-between gap-4"><p className="text-sm text-slate-500 max-w-xl">When disabled, visitors join the waitlist. When enabled, pricing buttons create accounts and start checkout.</p><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={config.publicSignupsEnabled} onChange={(e) => setConfig((current) => ({ ...current, publicSignupsEnabled: e.target.checked }))} className="w-4 h-4 rounded" />Public signup live</label></div></Card>}

      {tab === 'agency' && <div className="space-y-5"><Card title="Agency pricing"><p className="text-sm text-slate-500">Set the price for the included group package, then the amount automatically added for every group above that number.</p>{config.pricing.tiers.filter((tier) => tier.id === 'agency').map((tier) => { const index = config.pricing.tiers.findIndex((item) => item.id === tier.id); return <div key={tier.id} className="space-y-4"><div className="grid sm:grid-cols-3 gap-3"><Field label="Groups included" type="number" min="2" max="100" value={tier.includedGroupCount} onChange={(v) => updateTier(index, 'includedGroupCount', Number(v))} /><Field label="Base monthly $" type="number" min="1" step="0.01" value={(tier.monthlyAmountCents / 100).toFixed(2)} onChange={(v) => updateTierDollars(index, 'monthlyAmountCents', v)} /><Field label="Each added group / month $" type="number" min="1" step="0.01" value={(tier.monthlyAdditionalGroupCents / 100).toFixed(2)} onChange={(v) => updateTierDollars(index, 'monthlyAdditionalGroupCents', v)} /></div><div className="grid sm:grid-cols-2 gap-3"><Field label="Base annual $" type="number" min="1" step="0.01" value={(tier.annualAmountCents / 100).toFixed(2)} onChange={(v) => updateTierDollars(index, 'annualAmountCents', v)} /><Field label="Each added group / year $" type="number" min="1" step="0.01" value={(tier.annualAdditionalGroupCents / 100).toFixed(2)} onChange={(v) => updateTierDollars(index, 'annualAdditionalGroupCents', v)} /></div><Field label="Tier description" rows={3} value={tier.description} onChange={(v) => updateTier(index, 'description', v)} /></div>; })}</Card><Card title="Agency landing section"><div className="flex items-start justify-between gap-4"><p className="text-sm text-slate-500 max-w-2xl">This section explains the multi-group workspace and sends visitors to the live pricing calculator.</p><label className="flex items-center gap-2 text-sm font-semibold text-slate-700 shrink-0"><input type="checkbox" checked={config.agency.enabled} onChange={(e) => updateSection('agency', 'enabled', e.target.checked)} />Section live</label></div><div className="grid sm:grid-cols-2 gap-3"><Field label="Section label" value={config.agency.label} onChange={(v) => updateSection('agency', 'label', v)} /><Field label="Calculator button" value={config.agency.ctaLabel} onChange={(v) => updateSection('agency', 'ctaLabel', v)} /></div><Field label="Heading" rows={2} value={config.agency.heading} onChange={(v) => updateSection('agency', 'heading', v)} /><Field label="Description" rows={4} value={config.agency.description} onChange={(v) => updateSection('agency', 'description', v)} /><StringList label="Agency benefits" items={config.agency.features} onChange={(items) => updateSection('agency', 'features', items)} /></Card><Card title="Automatic management"><div className="grid md:grid-cols-3 gap-3 text-sm"><div className="rounded-xl bg-slate-50 p-4"><p className="font-bold text-slate-800">1. Customer selects groups</p><p className="text-slate-500 mt-1">The landing calculator shows the exact recurring total.</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="font-bold text-slate-800">2. Checkout bills the total</p><p className="text-slate-500 mt-1">The selected capacity is stored with the subscription.</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="font-bold text-slate-800">3. Capacity is enforced</p><p className="text-slate-500 mt-1">An agency can add groups up to its paid group limit.</p></div></div></Card></div>}

      {tab === 'hero' && <div className="space-y-5"><Card title="Navigation labels"><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{Object.entries(config.navigation).map(([key, value]) => <Field key={key} label={key.replace(/([A-Z])/g, ' $1')} value={value} onChange={(next) => updateSection('navigation', key, next)} />)}</div></Card><Card title="Hero"><Field label="Audience label" value={config.hero.eyebrow} onChange={(v) => updateSection('hero', 'eyebrow', v)} /><Field label="Headline" rows={2} value={config.hero.headline} onChange={(v) => updateSection('hero', 'headline', v)} /><Field label="Description" rows={4} value={config.hero.description} onChange={(v) => updateSection('hero', 'description', v)} /><Field label="Contact button" value={config.hero.contactButton} onChange={(v) => updateSection('hero', 'contactButton', v)} /></Card></div>}

      {tab === 'story' && <Card title="Founder story"><Field label="Section label" value={config.story.label} onChange={(v) => updateSection('story', 'label', v)} />{config.story.paragraphs.map((paragraph, index) => <Field key={index} label={`Paragraph ${index + 1}`} rows={5} value={paragraph} onChange={(value) => updateSection('story', 'paragraphs', config.story.paragraphs.map((item, i) => i === index ? value : item))} />)}</Card>}

      {tab === 'problems' && <div className="space-y-5"><Card title="Section introduction"><Field label="Heading" value={config.painPoints.heading} onChange={(v) => updateSection('painPoints', 'heading', v)} /><Field label="Description" rows={2} value={config.painPoints.description} onChange={(v) => updateSection('painPoints', 'description', v)} /></Card>{config.painPoints.items.map((item, index) => <Card key={index} title={`Problem ${index + 1}`}><Field label="Title" value={item.title} onChange={(v) => updateNested('painPoints', 'items', index, 'title', v)} /><Field label="Problem" rows={2} value={item.problem} onChange={(v) => updateNested('painPoints', 'items', index, 'problem', v)} /><Field label="Solution" rows={2} value={item.fix} onChange={(v) => updateNested('painPoints', 'items', index, 'fix', v)} /></Card>)}</div>}

      {tab === 'features' && <div className="space-y-5">
        <Card title="Feature section"><Field label="Heading" value={config.features.heading} onChange={(v) => updateSection('features', 'heading', v)} /></Card>
        <div className="grid md:grid-cols-2 gap-5">
          {config.features.groups.map((group, index) => (
            <Card key={group.id} title={`Feature card ${index + 1}`}>
              <div className="flex gap-3">
                <div className="w-32 shrink-0">
                  <label className={labelClass}>Icon</label>
                  <select className={inputClass} value={group.icon} onChange={(e) => updateNested('features', 'groups', index, 'icon', e.target.value)}>
                    {ICON_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </div>
                <div className="flex-1"><Field label="Title" value={group.title} onChange={(v) => updateNested('features', 'groups', index, 'title', v)} /></div>
              </div>
              <StringList label="Bullet points" items={group.items} onChange={(items) => updateNested('features', 'groups', index, 'items', items)} />
              <button
                type="button"
                onClick={() => removeFeatureGroup(index)}
                disabled={config.features.groups.length <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Remove feature card
              </button>
            </Card>
          ))}
        </div>
        <button type="button" onClick={addFeatureGroup} disabled={config.features.groups.length >= 8} className="px-4 py-2 rounded-lg border border-indigo-200 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed">+ Add feature card</button>
        <Card title="Detailed feature chart">
          <div className="grid sm:grid-cols-2 gap-3"><Field label="Eyebrow" value={config.features.comparison.eyebrow} onChange={(v) => updateComparison('eyebrow', v)} /><Field label="Heading" value={config.features.comparison.heading} onChange={(v) => updateComparison('heading', v)} /></div>
          <Field label="Description" rows={2} value={config.features.comparison.description} onChange={(v) => updateComparison('description', v)} />
          <div className="grid sm:grid-cols-2 gap-3"><Field label="Feature column label" value={config.features.comparison.featureColumnLabel} onChange={(v) => updateComparison('featureColumnLabel', v)} /><Field label="Footer note" value={config.features.comparison.footer} onChange={(v) => updateComparison('footer', v)} /></div>
        </Card>
        {config.features.comparison.categories.map((category, categoryIndex) => <Card key={category.id} title={category.name}>
          <div className="flex gap-2 items-end"><div className="flex-1"><Field label="Category name" value={category.name} onChange={(name) => updateComparisonCategory(categoryIndex, (current) => ({ ...current, name }))} /></div><button type="button" onClick={() => updateComparison('categories', config.features.comparison.categories.filter((_, index) => index !== categoryIndex))} className="mb-0.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50">Remove category</button></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="pb-2">Feature</th><th className="pb-2">Solo</th><th className="pb-2">Team</th><th className="pb-2">Studio</th><th className="pb-2">Agency</th><th /></tr></thead><tbody>{category.rows.map((row, rowIndex) => <tr key={row.id}><td className="pr-2 pb-2"><input className={inputClass} value={row.feature} onChange={(e) => updateComparisonCategory(categoryIndex, (current) => ({ ...current, rows: current.rows.map((item, index) => index === rowIndex ? { ...item, feature: e.target.value } : item) }))} /></td>{['solo', 'team', 'studio', 'agency'].map((tier) => <td key={tier} className="px-1 pb-2"><input className={inputClass} value={row[tier] || ''} onChange={(e) => updateComparisonCategory(categoryIndex, (current) => ({ ...current, rows: current.rows.map((item, index) => index === rowIndex ? { ...item, [tier]: e.target.value } : item) }))} /></td>)}<td className="pl-2 pb-2"><button type="button" onClick={() => updateComparisonCategory(categoryIndex, (current) => ({ ...current, rows: current.rows.filter((_, index) => index !== rowIndex) }))} className="text-red-500 hover:text-red-700" aria-label={`Remove ${row.feature}`}>×</button></td></tr>)}</tbody></table></div>
          <button type="button" onClick={() => updateComparisonCategory(categoryIndex, (current) => ({ ...current, rows: [...current.rows, { id: `${current.id}-feature-${Date.now()}`, feature: 'New feature', solo: 'Included', team: 'Included', studio: 'Included', agency: 'Included' }] }))} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">+ Add feature</button>
        </Card>)}
        <button type="button" onClick={addComparisonCategory} className="px-4 py-2 rounded-lg border border-indigo-200 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">+ Add category</button>
      </div>}

      {tab === 'reviews' && <div className="space-y-5">
        <Card title="Request a customer review">
          <p className="text-sm text-slate-500">Create a secure 30-day link. You can email it directly from GigWorks or copy it to send yourself.</p>
          <div className="grid sm:grid-cols-3 gap-3"><Field label="Customer name (optional)" value={requestForm.recipientName} onChange={(v) => setRequestForm((current) => ({ ...current, recipientName: v }))} /><Field label="Customer email" type="email" value={requestForm.recipientEmail} onChange={(v) => setRequestForm((current) => ({ ...current, recipientEmail: v }))} /><Field label="Group or business (optional)" value={requestForm.groupName} onChange={(v) => setRequestForm((current) => ({ ...current, groupName: v }))} /></div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={requestBusy} onClick={() => createReviewRequest(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create and email link</button><button type="button" disabled={requestBusy} onClick={() => createReviewRequest(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Create link only</button></div>
        </Card>
        {reviewRequests.length > 0 && <Card title={`Review request inbox${reviewRequests.some((item) => item.status === 'submitted') ? ` · ${reviewRequests.filter((item) => item.status === 'submitted').length} pending` : ''}`}>
          <div className="space-y-3">{reviewRequests.map((request) => <article key={request.id} className={`rounded-xl border p-4 ${request.status === 'submitted' ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-800">{request.groupName || request.requestedGroupName || request.recipientName || request.recipientEmail}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${request.status === 'submitted' ? 'bg-amber-200 text-amber-900' : request.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : request.status === 'declined' ? 'bg-slate-200 text-slate-600' : 'bg-indigo-100 text-indigo-700'}`}>{request.status === 'submitted' ? 'Pending review' : request.status}</span></div><p className="text-xs text-slate-500 mt-1">{request.recipientEmail}{request.sentAt ? ` · Sent ${new Date(request.sentAt).toLocaleDateString()}` : ' · Not emailed yet'}</p></div><div className="flex flex-wrap gap-2">{request.status === 'open' && <><button type="button" onClick={() => copyReviewLink(request.reviewLink)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Copy link</button><button type="button" onClick={() => sendReviewRequest(request.id)} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">{request.sentAt ? 'Resend' : 'Send email'}</button></>}{request.status === 'submitted' && <><button type="button" onClick={() => moderateReview(request.id, 'approve')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Approve as draft</button><button type="button" onClick={() => moderateReview(request.id, 'decline')} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600">Decline</button></>}</div></div>
            {request.status !== 'open' && request.quote && <div className="mt-4 border-t border-slate-200/70 pt-4"><div className="text-amber-400" aria-label={`${request.rating} stars`}>{'★'.repeat(request.rating)}</div><blockquote className="mt-2 text-sm text-slate-700">“{request.quote}”</blockquote>{(request.storyTitle || request.storyBody) && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-indigo-700">View submitted story</summary><div className="mt-2 text-slate-600 whitespace-pre-line"><strong>{request.storyTitle}</strong>{request.storySummary && `\n${request.storySummary}`}{request.storyBody && `\n\n${request.storyBody}`}</div></details>}</div>}
            {request.status === 'open' && <input readOnly value={request.reviewLink} onFocus={(e) => e.target.select()} className="mt-3 w-full rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500" aria-label={`Review link for ${request.recipientEmail}`} />}
          </article>)}</div>
        </Card>}
        <Card title="Customer reviews and stories">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <p className="text-sm text-slate-500 max-w-2xl">Nothing in this section appears publicly until the master switch and the individual review's publish switch are both enabled. Featured reviews rotate on the homepage and link to the customer stories page.</p>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 shrink-0"><input type="checkbox" checked={config.testimonials.enabled} onChange={(e) => updateSection('testimonials', 'enabled', e.target.checked)} className="w-4 h-4 rounded" />Section live</label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3"><Field label="Homepage heading" value={config.testimonials.heading} onChange={(v) => updateSection('testimonials', 'heading', v)} /><Field label="Stories page heading" value={config.testimonials.pageHeading} onChange={(v) => updateSection('testimonials', 'pageHeading', v)} /></div>
          <Field label="Homepage description" rows={2} value={config.testimonials.description} onChange={(v) => updateSection('testimonials', 'description', v)} />
          <Field label="Stories page description" rows={2} value={config.testimonials.pageDescription} onChange={(v) => updateSection('testimonials', 'pageDescription', v)} />
        </Card>
        {config.testimonials.reviews.map((review, index) => <Card key={review.id} title={`Review ${index + 1} — ${review.groupName}`}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"><Field label="Group or business name" value={review.groupName} onChange={(v) => updateReview(index, 'groupName', v)} /><Field label="Reviewer name (optional)" value={review.reviewerName} onChange={(v) => updateReview(index, 'reviewerName', v)} /><Field label="Group type (optional)" value={review.groupType} onChange={(v) => updateReview(index, 'groupType', v)} /></div>
          <Field label="Review" rows={4} value={review.quote} onChange={(v) => updateReview(index, 'quote', v)} />
          <div>
            <label className={labelClass}>Star rating</label>
            <div className="flex gap-1" role="radiogroup" aria-label={`Rating for ${review.groupName}`}>{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" role="radio" aria-checked={review.rating === star} onClick={() => updateReview(index, 'rating', star)} className={`text-2xl leading-none ${star <= review.rating ? 'text-amber-400' : 'text-slate-300'} hover:text-amber-400`} aria-label={`${star} star${star === 1 ? '' : 's'}`}>★</button>)}</div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-slate-50 px-3 py-3">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={review.published} onChange={(e) => updateReview(index, 'published', e.target.checked)} />Publish review</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={review.featured} onChange={(e) => updateReview(index, 'featured', e.target.checked)} />Feature in homepage slider</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={review.storyPublished} onChange={(e) => updateReview(index, 'storyPublished', e.target.checked)} />Publish full story</label>
          </div>
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Optional customer story</p>
            <Field label="Story title" value={review.storyTitle} onChange={(v) => updateReview(index, 'storyTitle', v)} />
            <Field label="Short summary" rows={2} value={review.storySummary} onChange={(v) => updateReview(index, 'storySummary', v)} />
            <Field label="Full story" rows={8} value={review.storyBody} onChange={(v) => updateReview(index, 'storyBody', v)} />
          </div>
          <button type="button" onClick={() => removeReview(index)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50">Remove review</button>
        </Card>)}
        <button type="button" onClick={addReview} disabled={config.testimonials.reviews.length >= 30} className="px-4 py-2 rounded-lg border border-indigo-200 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">+ Add customer review</button>
      </div>}

      {tab === 'pricing' && <div className="space-y-5"><Card title="Pricing section"><div className="grid sm:grid-cols-2 gap-3"><Field label="Section label" value={config.pricing.label} onChange={(v) => updateSection('pricing', 'label', v)} /><Field label="Heading" value={config.pricing.heading} onChange={(v) => updateSection('pricing', 'heading', v)} /></div><Field label="Description" value={config.pricing.description} onChange={(v) => updateSection('pricing', 'description', v)} /><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><Field label="Monthly label" value={config.pricing.monthlyLabel} onChange={(v) => updateSection('pricing', 'monthlyLabel', v)} /><Field label="Annual label" value={config.pricing.annualLabel} onChange={(v) => updateSection('pricing', 'annualLabel', v)} /><Field label="Savings badge" value={config.pricing.annualSavingsLabel} onChange={(v) => updateSection('pricing', 'annualSavingsLabel', v)} /><Field label="Featured badge" value={config.pricing.featuredLabel} onChange={(v) => updateSection('pricing', 'featuredLabel', v)} /></div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"><Field label="Per-month suffix" value={config.pricing.perMonthLabel} onChange={(v) => updateSection('pricing', 'perMonthLabel', v)} /><Field label="Annual billing label" value={config.pricing.billedAnnuallyLabel} onChange={(v) => updateSection('pricing', 'billedAnnuallyLabel', v)} /><Field label="Monthly billing label" value={config.pricing.billedMonthlyLabel} onChange={(v) => updateSection('pricing', 'billedMonthlyLabel', v)} /><Field label="Trial button ({days} supported)" value={config.pricing.trialButtonLabel} onChange={(v) => updateSection('pricing', 'trialButtonLabel', v)} /><Field label="Trial footer ({days} supported)" value={config.pricing.trialFooterLabel} onChange={(v) => updateSection('pricing', 'trialFooterLabel', v)} /></div><div className="grid sm:grid-cols-2 gap-3"><Field label="Trial days" type="number" min="0" max="60" value={config.pricing.trialDays} onChange={(v) => updateSection('pricing', 'trialDays', v)} /><Field label="Pricing footer" value={config.pricing.footer} onChange={(v) => updateSection('pricing', 'footer', v)} /></div><StringList label="Features included in every plan" items={config.pricing.includedFeatures} onChange={(items) => updateSection('pricing', 'includedFeatures', items)} /></Card><div className="grid md:grid-cols-3 gap-5">{config.pricing.tiers.map((tier, index) => <Card key={tier.id} title={tier.name}><Field label="Plan name" value={tier.name} onChange={(v) => updateTier(index, 'name', v)} /><div className="grid grid-cols-2 gap-2"><Field label="Monthly $" type="number" min="1" step="0.01" value={(tier.monthlyAmountCents / 100).toFixed(2)} onChange={(v) => updateTierDollars(index, 'monthlyAmountCents', v)} /><Field label="Annual $" type="number" min="1" step="0.01" value={(tier.annualAmountCents / 100).toFixed(2)} onChange={(v) => updateTierDollars(index, 'annualAmountCents', v)} /></div><Field label="Description" rows={3} value={tier.description} onChange={(v) => updateTier(index, 'description', v)} /><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={tier.featured} onChange={(e) => updateTier(index, 'featured', e.target.checked)} />Featured plan</label></Card>)}</div><p className="text-xs text-slate-500">Changing an amount creates a new Stripe price for future customers. Existing subscribers keep their current rate.</p></div>}

      {tab === 'faq' && <div className="space-y-5"><Card title="FAQ introduction"><Field label="Heading" value={config.faq.heading} onChange={(v) => updateSection('faq', 'heading', v)} /><Field label="Description" value={config.faq.description} onChange={(v) => updateSection('faq', 'description', v)} /></Card>{config.faq.items.map((item, index) => <Card key={index} title={`Question ${index + 1}`}><Field label="Question" value={item.question} onChange={(v) => updateNested('faq', 'items', index, 'question', v)} /><Field label="Answer" rows={4} value={item.answer} onChange={(v) => updateNested('faq', 'items', index, 'answer', v)} /></Card>)}</div>}

      {tab === 'forms' && <div className="grid md:grid-cols-2 gap-5"><Card title="Waitlist"><Field label="Heading" value={config.waitlist.heading} onChange={(v) => updateSection('waitlist', 'heading', v)} /><Field label="Description" rows={3} value={config.waitlist.description} onChange={(v) => updateSection('waitlist', 'description', v)} /><Field label="Success message" rows={2} value={config.waitlist.success} onChange={(v) => updateSection('waitlist', 'success', v)} /><Field label="Submit button" value={config.waitlist.submitLabel} onChange={(v) => updateSection('waitlist', 'submitLabel', v)} /><Field label="Name placeholder" value={config.waitlist.namePlaceholder} onChange={(v) => updateSection('waitlist', 'namePlaceholder', v)} /><Field label="Email placeholder" value={config.waitlist.emailPlaceholder} onChange={(v) => updateSection('waitlist', 'emailPlaceholder', v)} /><Field label="Business placeholder" value={config.waitlist.businessPlaceholder} onChange={(v) => updateSection('waitlist', 'businessPlaceholder', v)} /></Card><Card title="Contact"><Field label="Heading" value={config.contact.heading} onChange={(v) => updateSection('contact', 'heading', v)} /><Field label="Description" rows={3} value={config.contact.description} onChange={(v) => updateSection('contact', 'description', v)} /><Field label="Success message" rows={2} value={config.contact.success} onChange={(v) => updateSection('contact', 'success', v)} /><Field label="Submit button" value={config.contact.submitLabel} onChange={(v) => updateSection('contact', 'submitLabel', v)} /><Field label="Name placeholder" value={config.contact.namePlaceholder} onChange={(v) => updateSection('contact', 'namePlaceholder', v)} /><Field label="Email placeholder" value={config.contact.emailPlaceholder} onChange={(v) => updateSection('contact', 'emailPlaceholder', v)} /><Field label="Message placeholder" value={config.contact.messagePlaceholder} onChange={(v) => updateSection('contact', 'messagePlaceholder', v)} /></Card><Card title="Footer"><Field label="Tagline" value={config.footer.tagline} onChange={(v) => updateSection('footer', 'tagline', v)} /></Card></div>}

      {tab === 'legal' && <Card title="Terms of Service / Privacy Policy / Cookie Policy">
        <p className="text-sm text-slate-500">These identifying details are used across all three legal pages (/terms, /privacy, /cookies). The rest of each document's text is fixed.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Legal entity name" value={config.legal.entityName} onChange={(v) => updateSection('legal', 'entityName', v)} />
          <Field label="Governing law (state/country)" value={config.legal.governingLaw} onChange={(v) => updateSection('legal', 'governingLaw', v)} />
          <Field label="Contact email" type="email" value={config.legal.contactEmail} onChange={(v) => updateSection('legal', 'contactEmail', v)} />
          <Field label="Last updated" type="date" value={config.legal.effectiveDate} onChange={(v) => updateSection('legal', 'effectiveDate', v)} />
        </div>
      </Card>}
    </form>
  );
}
