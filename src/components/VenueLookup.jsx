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
  async function search(place) {
    if (busy) return;
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
    <button type="button" className="mt-2 text-sm font-semibold text-indigo-600" onClick={() => { setQuery(venue.name || ''); setPlaces(null); setSelected(null); setError(''); setOpen(true); }}>Find venue details</button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title="Find venue details">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Enter the venue name, then choose the match with the correct address. Available details fill empty fields only.</p>
        <label className="block text-sm font-semibold">Country<select value={country} disabled={busy} onChange={(event) => { setCountry(event.target.value); setPlaces(null); setSelected(null); setError(''); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="us">United States</option><option value="ca">Canada</option><option value="gb">United Kingdom</option><option value="il">Israel</option><option value="au">Australia</option><option value="nz">New Zealand</option><option value="ie">Ireland</option><option value="fr">France</option><option value="de">Germany</option><option value="mx">Mexico</option></select></label>
        <p className="text-xs text-slate-500">Only venues in the selected country are shown.</p>
        <label className="block text-sm font-semibold">Venue name<input value={query} placeholder="e.g. Marina Del Rey" maxLength={240} disabled={busy} onChange={(event) => { setQuery(event.target.value); setPlaces(null); setSelected(null); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search(); } }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <button type="button" disabled={busy || query.trim().length < 3} onClick={() => search()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Looking up…' : 'Search venues'}</button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {places?.length === 0 && <p className="text-sm text-slate-500">No matches found. Try a shorter name or another spelling. Some venues may not be listed.</p>}
        <div className="space-y-2">{places?.map((place) => <button type="button" key={place.placeId} disabled={busy} onClick={() => search(place)} className="block w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"><span className="block font-semibold">{place.name}</span><span className="text-sm text-slate-500">{place.formattedAddress}</span></button>)}</div>
        {selected && <section className="space-y-2 rounded-lg bg-indigo-50 p-3"><h4 className="font-semibold">{selected.name}</h4><p className="text-sm">{selected.formattedAddress}</p>{selected.contactPhone && <p className="text-sm">Phone: {selected.contactPhone}</p>}{selected.contactEmail && <p className="text-sm">Email: {selected.contactEmail}</p>}<button type="button" onClick={() => { onSelect(fillEmptyVenueFields(venue, selected)); setOpen(false); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Fill empty fields</button></section>}
        <p className="text-xs text-slate-500">Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a></p>
      </div>
    </Modal>
  </>;
}
