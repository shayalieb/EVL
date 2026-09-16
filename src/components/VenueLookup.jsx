import { useState } from 'react';
import { apiFetch } from '../context/AuthContext';
import Modal from './ui/Modal';
import { fillEmptyVenueFields } from '../lib/venueLookup';

export default function VenueLookup({ venue, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('us');
  const [places, setPlaces] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState('geoapify');
  const [website, setWebsite] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  async function extraSearch(provider) {
    if (busy) return;
    setBusy(true); setError(''); setSelected(null); setPlaces(null); setSource(provider); setSourceUrl('');
    try {
      const data = provider === 'google'
        ? await apiFetch(`/venues/google-search?${new URLSearchParams({ query, country })}`)
        : await apiFetch('/venues/website-import', { method: 'POST', body: JSON.stringify({ url: website }) });
      setPlaces(data.places); setSourceUrl(data.sourceUrl || '');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function search(place) {
    if (busy) return;
    setSource('geoapify'); setSourceUrl('');
    setBusy(true); setError(''); setSelected(null);
    if (!place) setPlaces(null);
    try {
      const params = new URLSearchParams(place ? { placeId: place.placeId, country } : { query, country });
      const data = await apiFetch(`/venues/lookup?${params}`);
      if (place) {
        // Geoapify can return a canonical details ID different from its search ID.
        const found = data.places[0];
        if (!found) throw new Error('Details are unavailable for this venue. Try another match.');
        setSelected(found);
      } else setPlaces(data.places);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="mt-2 text-sm font-semibold text-indigo-600" onClick={() => { setSource('geoapify'); setSourceUrl(''); setWebsite(''); setQuery(venue.name || ''); setPlaces(null); setSelected(null); setError(''); setOpen(true); }}>Find venue details</button>
    <Modal open={open} onClose={() => { if (!busy) { setOpen(false); setPlaces(null); setSelected(null); } }} title="Find venue details">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Enter the venue name, then choose the match with the correct address. Available details fill empty fields only.</p>
        <label className="block text-sm font-semibold">Country<select value={country} disabled={busy} onChange={(event) => { setCountry(event.target.value); setPlaces(null); setSelected(null); setError(''); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="us">United States</option><option value="ca">Canada</option><option value="gb">United Kingdom</option><option value="il">Israel</option><option value="au">Australia</option><option value="nz">New Zealand</option><option value="ie">Ireland</option><option value="fr">France</option><option value="de">Germany</option><option value="mx">Mexico</option></select></label>
        <p className="text-xs text-slate-500">Search results are limited to the selected country.</p>
        <label className="block text-sm font-semibold">Venue name<input value={query} placeholder="e.g. Marina Del Rey" maxLength={240} disabled={busy} onChange={(event) => { setQuery(event.target.value); setPlaces(null); setSelected(null); }} onKeyDown={(event) => { if (event.key === 'Enter' && query.trim().length >= 3) { event.preventDefault(); search(); } }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <button type="button" disabled={busy || query.trim().length < 3} onClick={() => search()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Looking up…' : 'Search venues'}</button>
        <button type="button" disabled={busy || query.trim().length < 3} onClick={() => extraSearch('google')} className="ml-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Search Google</button>
        <details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Import from venue website</summary><p className="my-2 text-xs text-slate-500">Paste the venue’s own website or contact page. Review published details before filling empty fields. Only import from sites that permit it.</p><label className="block text-sm">Venue website<input type="url" value={website} disabled={busy} onChange={(event) => setWebsite(event.target.value)} placeholder="https://venue.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><button type="button" disabled={busy || !website.trim()} onClick={() => extraSearch('website')} className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Review website details</button></details>
        {source === 'google' && <p className="text-sm text-slate-500">Google results are for reference. Open a match to check the venue, then use its own website to import details or enter them manually.</p>}
        {source === 'website' && sourceUrl && <p className="text-sm">Source: <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">Venue website</a>. Confirm the address is in your selected country.</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {places?.length === 0 && <p className="text-sm text-slate-500">{source === 'website' ? 'This page has no supported venue details. Try its contact page or enter the details manually.' : 'No matches found. Try a shorter name or another spelling, Google search, or the venue’s website.'}</p>}
        <div className="space-y-2">{places?.map((place, index) => source === 'google' ? <section key={place.placeId} className="rounded-lg border border-slate-200 p-3"><a href={place.mapsUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 underline">{place.name}</a><p className="text-sm text-slate-500">{place.formattedAddress}</p>{place.attributions?.map((item, i) => <p key={i} className="text-xs text-slate-500">{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : item.name}</p>)}</section> : <button type="button" key={place.placeId || index} disabled={busy} onClick={() => source === 'website' ? setSelected(place) : search(place)} className="block w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"><span className="block font-semibold">{place.name}</span><span className="text-sm text-slate-500">{place.formattedAddress}</span></button>)}</div>
        {selected && <section className="space-y-2 rounded-lg bg-indigo-50 p-3"><h4 className="font-semibold">{selected.name}</h4><p className="text-sm">{selected.formattedAddress}</p>{selected.contactPhone && <p className="text-sm">Phone: {selected.contactPhone}</p>}{selected.contactEmail && <p className="text-sm">Email: {selected.contactEmail}</p>}<button type="button" onClick={() => { onSelect(fillEmptyVenueFields(venue, selected)); setOpen(false); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Fill empty fields</button></section>}
        {source === 'geoapify' && <p className="text-xs text-slate-500">Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a></p>}
        {source === 'google' && <p className="text-sm font-medium text-slate-600">Google Maps · <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer" className="underline">Terms</a> · <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline">Privacy</a></p>}
      </div>
    </Modal>
  </>;
}
