import { useEffect, useState } from 'react';
import { apiFetch } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function dollars(cents) { return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`; }

export default function AdminWebsitePage() {
  const { showToast } = useToast();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/admin/website/config').then((data) => setConfig(data.config)).catch((err) => setError(err.message));
  }, []);

  function updateHero(key, value) { setConfig((current) => ({ ...current, hero: { ...current.hero, [key]: value } })); }
  function updatePricing(key, value) { setConfig((current) => ({ ...current, pricing: { ...current.pricing, [key]: value } })); }
  function updateTier(index, key, value) {
    setConfig((current) => ({ ...current, pricing: { ...current.pricing, tiers: current.pricing.tiers.map((tier, i) => i === index ? { ...tier, [key]: value } : tier) } }));
  }
  function updateTierDollars(index, key, value) {
    const cents = Math.round(Number(value) * 100);
    updateTier(index, key, Number.isFinite(cents) ? cents : 0);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await apiFetch('/admin/website/config', { method: 'PUT', body: JSON.stringify({ config }) });
      setConfig(data.config);
      showToast('Website settings published');
    } catch (err) { showToast(err.message, 'error'); } finally { setSaving(false); }
  }

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!config) return <div className="text-sm text-slate-400">Loading…</div>;

  return (
    <form onSubmit={save} className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl font-bold text-slate-800">Website</h2><p className="text-sm text-slate-500 mt-1">Control public landing-page content and launch access.</p></div><button disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">{saving ? 'Publishing…' : 'Publish changes'}</button></div>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-slate-800">Public signup</h3><p className="text-sm text-slate-500">When off, visitors join the waitlist. When on, plan buttons open account signup.</p></div><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={config.publicSignupsEnabled} onChange={(e) => setConfig((current) => ({ ...current, publicSignupsEnabled: e.target.checked }))} className="w-4 h-4 rounded" />Live</label></div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-slate-800">Hero content</h3>
        <div><label className={labelClass}>Audience label</label><input className={inputClass} value={config.hero.eyebrow} onChange={(e) => updateHero('eyebrow', e.target.value)} /></div>
        <div><label className={labelClass}>Headline</label><textarea rows={2} className={inputClass} value={config.hero.headline} onChange={(e) => updateHero('headline', e.target.value)} /></div>
        <div><label className={labelClass}>Description</label><textarea rows={3} className={inputClass} value={config.hero.description} onChange={(e) => updateHero('description', e.target.value)} /></div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div><h3 className="font-bold text-slate-800">Pricing</h3><p className="text-xs text-slate-500 mt-1">Price changes create new Stripe prices for future customers. Existing subscribers remain on their current price until they change plans.</p></div>
        <div className="grid sm:grid-cols-2 gap-3"><div><label className={labelClass}>Section heading</label><input className={inputClass} value={config.pricing.heading} onChange={(e) => updatePricing('heading', e.target.value)} /></div><div><label className={labelClass}>Trial days</label><input type="number" min="0" max="60" className={inputClass} value={config.pricing.trialDays} onChange={(e) => updatePricing('trialDays', e.target.value)} /></div></div>
        <div><label className={labelClass}>Section description</label><input className={inputClass} value={config.pricing.description} onChange={(e) => updatePricing('description', e.target.value)} /></div>
        <div className="grid md:grid-cols-3 gap-4 pt-2">{config.pricing.tiers.map((tier, index) => <div key={tier.id} className="rounded-xl border border-slate-200 p-4 space-y-3"><div className="text-xs font-semibold uppercase text-slate-400">{tier.seatLimit} seat{tier.seatLimit === 1 ? '' : 's'}</div><div><label className={labelClass}>Plan name</label><input className={inputClass} value={tier.name} onChange={(e) => updateTier(index, 'name', e.target.value)} /></div><div className="grid grid-cols-2 gap-2"><div><label className={labelClass}>Monthly $</label><input type="number" min="1" step="0.01" className={inputClass} value={(tier.monthlyAmountCents / 100).toFixed(2)} onChange={(e) => updateTierDollars(index, 'monthlyAmountCents', e.target.value)} /></div><div><label className={labelClass}>Annual $</label><input type="number" min="1" step="0.01" className={inputClass} value={(tier.annualAmountCents / 100).toFixed(2)} onChange={(e) => updateTierDollars(index, 'annualAmountCents', e.target.value)} /></div></div><div><label className={labelClass}>Description</label><textarea rows={3} className={inputClass} value={tier.description} onChange={(e) => updateTier(index, 'description', e.target.value)} /></div><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={tier.featured} onChange={(e) => updateTier(index, 'featured', e.target.checked)} />Featured plan</label><div className="text-[11px] text-slate-400">{dollars(tier.monthlyAmountCents)}/mo · {dollars(tier.annualAmountCents)}/yr</div></div>)}</div>
      </section>
    </form>
  );
}
