import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicStagePlot } from '../lib/stagePlotShare';
import { stagePlotNotesToPlainText } from '../lib/stagePlotNotes';

const PROVIDED = { artist: 'Artist', venue: 'Venue', rental: 'Rental company' };

export default function PublicStagePlotPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('plot');
  useEffect(() => { getPublicStagePlot(token).then(setData).catch((err) => setError(err.message)); }, [token]);
  if (error) return <PublicShell><div className="mx-auto max-w-lg rounded-xl border border-red-100 bg-white p-8 text-center"><h1 className="text-xl font-bold text-slate-800">Stage plot unavailable</h1><p className="mt-2 text-sm text-slate-500">{error}</p></div></PublicShell>;
  if (!data) return <PublicShell><p className="text-center text-sm text-slate-500">Loading stage plot…</p></PublicShell>;
  const { stagePlot } = data;
  const event = stagePlot.event || {};
  const venue = typeof event.venue === 'object' && event.venue ? event.venue : {};
  const advanced = stagePlot.channels.some((channel) => channel.inputType || channel.preferredDevice || channel.monitorMix || channel.stageboxName);
  const tabs = [['plot', 'Stage Plot'], ['inputs', 'Production List'], ...(advanced ? [['audio', 'Audio Details']] : []), ['backline', 'Backline']];
  return (
    <PublicShell>
      <header className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="text-xs font-bold uppercase tracking-widest text-indigo-600">Shared from GigWorks</div><h1 className="mt-1 text-2xl font-bold text-slate-900">{event.name || stagePlot.name}</h1><p className="mt-1 text-sm text-slate-500">{[event.eventType, event.eventDate, venue.name || venue.venueName].filter(Boolean).join(' · ')}</p></div>
          <div className="flex gap-2 print:hidden"><button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Print / Save PDF</button></div>
        </div>
        <p className="mt-3 text-xs text-slate-400">Last updated {new Date(stagePlot.updatedAt).toLocaleString()}</p>
      </header>
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden">{tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${tab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>{label}</button>)}</nav>
      <main className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-6 print:border-0 print:p-0 print:shadow-none">
        {tab === 'plot' && <div className="space-y-6">{stagePlot.pages.map((page) => <section key={page.id}><h2 className="mb-2 text-sm font-bold text-slate-700">{page.name}</h2>{page.imageUrl ? <img src={page.imageUrl} alt={page.name} className="h-auto w-full rounded-lg border border-slate-200" /> : <div className="rounded-lg bg-slate-50 p-8 text-center text-sm text-slate-400">No saved preview is available for this page.</div>}</section>)}</div>}
        {tab === 'inputs' && <ResponsiveTable headings={['Ch', 'Musician', 'Instrument', '48V', 'Power', 'Notes']} rows={stagePlot.channels.map((channel) => [channel.channelNumber, channel.musicianName || '—', channel.source, channel.phantomPower ? 'Yes' : '—', channel.powerNeeded ? 'Yes' : '—', stagePlotNotesToPlainText(channel.monitorNotes) || '—'])} />}
        {tab === 'audio' && <ResponsiveTable headings={['Ch', 'Input / Device', 'Stand / Connection', 'Patch', 'Monitor', 'Provider', 'Power / Cable']} rows={stagePlot.channels.map((channel) => [channel.channelNumber, [channel.inputType, channel.preferredDevice, channel.substituteDevice && `Alt: ${channel.substituteDevice}`].filter(Boolean).join(' · ') || '—', [channel.standType, channel.connectionType, channel.channelFormat].filter(Boolean).join(' · ') || '—', [channel.stageboxName, channel.stageboxInput].filter(Boolean).join(' / ') || '—', channel.monitorMix || '—', PROVIDED[channel.providedBy] || channel.providedBy || '—', [channel.powerDetails, channel.cableDetails].filter(Boolean).join(' · ') || '—'])} />}
        {tab === 'backline' && (stagePlot.backlineItems.length ? <ResponsiveTable headings={['Item', 'Qty', 'Provided by', 'Notes']} rows={stagePlot.backlineItems.map((item) => [item.item, item.quantity, PROVIDED[item.providedBy] || item.providedBy || 'TBD', stagePlotNotesToPlainText(item.notesHtml) || '—'])} /> : <p className="py-10 text-center text-sm text-slate-400">No backline requirements were included.</p>)}
      </main>
    </PublicShell>
  );
}

function PublicShell({ children }) { return <div className="min-h-screen bg-slate-50 px-3 py-6 text-slate-800 sm:px-6"><div className="mx-auto max-w-6xl">{children}</div></div>; }

function ResponsiveTable({ headings, rows }) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-slate-400">No items were included.</p>;
  return <><div className="space-y-3 sm:hidden">{rows.map((row, index) => <article key={index} className="rounded-lg border border-slate-200 p-3">{row.map((cell, cellIndex) => <div key={headings[cellIndex]} className="grid grid-cols-[7rem_1fr] gap-2 border-b border-slate-100 py-1.5 last:border-0"><span className="text-[11px] font-bold uppercase text-slate-400">{headings[cellIndex]}</span><span className="text-sm text-slate-700">{cell}</span></div>)}</article>)}</div><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[46rem] text-left text-sm"><thead><tr className="border-b bg-slate-50">{headings.map((heading) => <th key={heading} className="px-3 py-3 text-xs font-bold uppercase text-slate-500">{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-slate-100">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 align-top text-slate-700">{cell}</td>)}</tr>)}</tbody></table></div></>;
}
