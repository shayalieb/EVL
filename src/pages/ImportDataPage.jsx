import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { commitDataImport, previewDataImport } from '../lib/imports';
import { beginGoogleCalendarConnection, disconnectGoogleCalendar, exportGoogleCalendar, getGoogleCalendars, getGoogleCalendarStatus } from '../lib/googleCalendar';
import { useToast } from '../components/ui/Toast';

const fileClass = 'block w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100';

async function readFile(file) {
  if (!file) return '';
  return file.text();
}

const SOURCE_OPTIONS = [
  { id: 'google_calendar', name: 'Google Calendar', description: 'Import previous and upcoming calendar events.' },
  { id: 'pandadoc', name: 'PandaDoc', description: 'Import contacts and document history.' },
  { id: 'csv', name: 'Client CSV', description: 'Import a client list from another system.' },
  { id: 'other', name: 'Another system', description: 'Use standard client and calendar exports.' },
];

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function Stat({ label, value, tone = 'slate' }) {
  const colors = tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700';
  return <div className={`rounded-xl border p-4 ${colors}`}><div className="text-2xl font-bold">{value}</div><div className="mt-1 text-xs font-medium">{label}</div></div>;
}

export default function ImportDataPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const [sourceType, setSourceType] = useState('');
  const [migrationName, setMigrationName] = useState('');
  const [clientFile, setClientFile] = useState(null);
  const [calendarFile, setCalendarFile] = useState(null);
  const [pandaDocFile, setPandaDocFile] = useState(null);
  const [sources, setSources] = useState(null);
  const [preview, setPreview] = useState(null);
  const [token, setToken] = useState('');
  const [decisions, setDecisions] = useState({});
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [googleConnection, setGoogleConnection] = useState(null);
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleCalendarId, setGoogleCalendarId] = useState('');
  const [googleLoading, setGoogleLoading] = useState(true);

  useEffect(() => {
    const callbackStatus = searchParams.get('googleCalendar');
    if (callbackStatus === 'connected') { setSourceType('google_calendar'); setMigrationName('Google Calendar migration'); showToast('Google Calendar connected.'); }
    if (callbackStatus === 'error') setError(searchParams.get('message') || 'Unable to connect Google Calendar.');
    if (callbackStatus) { const next = new URLSearchParams(searchParams); next.delete('googleCalendar'); next.delete('message'); setSearchParams(next, { replace: true }); }
    getGoogleCalendarStatus().then(async (connection) => {
      setGoogleConnection(connection);
      if (connection.connected) { const calendars = await getGoogleCalendars(); setGoogleCalendars(calendars); setGoogleCalendarId(calendars.find((item) => item.primary)?.id || calendars[0]?.id || ''); }
    }).catch(() => {}).finally(() => setGoogleLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unresolved = useMemo(() => preview?.clients.filter((client) => client.recommendation === 'review' && !decisions[client.rowId]).length || 0, [preview, decisions]);

  async function handlePreview(event) {
    event.preventDefault();
    setWorking(true); setError(''); setResult(null);
    try {
      let calendarIcs = await readFile(calendarFile);
      if (sourceType === 'google_calendar' && googleConnection?.connected && googleCalendarId && !calendarFile) {
        const exported = await exportGoogleCalendar(googleCalendarId);
        calendarIcs = exported.calendarIcs;
        if (exported.limited) showToast('Google returned the first 2,500 events. Import these before loading additional history.', 'warning');
      }
      const nextSources = { sourceType, migrationName, clientsCsv: await readFile(clientFile), calendarIcs, pandaDocCsv: await readFile(pandaDocFile) };
      const data = await previewDataImport(nextSources);
      const defaults = {};
      for (const client of data.preview.clients) {
        if (client.recommendation === 'link') defaults[client.rowId] = `existing:${client.candidates[0].id}`;
        if (client.recommendation === 'create') defaults[client.rowId] = 'create';
      }
      setSources(nextSources); setPreview(data.preview); setToken(data.token); setDecisions(defaults);
    } catch (err) { setError(err.message); }
    finally { setWorking(false); }
  }

  async function handleCommit() {
    if (!sources || !preview || working) return;
    if (!window.confirm(`Import ${preview.summary.clientsToCreate} potential new clients and ${preview.summary.bookingsToCreate} separate bookings?`)) return;
    setWorking(true); setError('');
    try {
      const data = await commitDataImport(sources, token, decisions);
      setResult(data.result);
      showToast('Import completed.');
    } catch (err) { setError(err.message); }
    finally { setWorking(false); }
  }

  function resetPreview() {
    setPreview(null); setSources(null); setToken(''); setDecisions({}); setResult(null); setError('');
  }

  function changeSource(nextSource) {
    setSourceType(nextSource); setClientFile(null); setCalendarFile(null); setPandaDocFile(null); resetPreview();
    const label = SOURCE_OPTIONS.find((option) => option.id === nextSource)?.name || 'Data';
    setMigrationName(`${label} migration`);
  }

  function downloadReport() {
    if (!result || !preview) return;
    const rows = [
      ['Migration report'], ['Migration ID', result.migrationId], ['Migration name', result.migrationName || ''],
      ['Source', SOURCE_OPTIONS.find((option) => option.id === result.sourceType)?.name || result.sourceType],
      ['Completed at', new Date(result.completedAt).toLocaleString()], ['Clients created', result.clientsCreated],
      ['Clients linked to existing records', result.clientsLinked], ['Clients skipped', result.clientsSkipped],
      ['Separate bookings created', result.bookingsCreated], ['Historical completed bookings', result.historicalBookings],
      ['Invalid rows skipped', result.skippedRows], [], ['Skipped source rows'], ['Type', 'Row/Event', 'Name', 'Reason'],
      ...preview.errors.clients.map((item) => ['Client CSV', item.rowNumber || '', '', item.messages.join(' ')]),
      ...preview.errors.calendar.map((item) => ['Google Calendar', item.eventNumber || '', item.title || '', item.messages.join(' ')]),
      ...preview.errors.pandaDoc.map((item) => ['PandaDoc', item.rowNumber || '', item.title || '', item.messages.join(' ')]),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `gigworks-migration-${result.migrationId}.csv`; link.click();
    URL.revokeObjectURL(url);
  }

  async function connectGoogle() {
    setGoogleLoading(true); setError('');
    try { window.location.assign(await beginGoogleCalendarConnection()); }
    catch (err) { setError(err.message); setGoogleLoading(false); }
  }

  async function disconnectGoogle() {
    if (!window.confirm('Disconnect Google Calendar? No Google events or GigWorks records will be deleted.')) return;
    setGoogleLoading(true);
    try { setGoogleConnection(await disconnectGoogleCalendar()); setGoogleCalendars([]); setGoogleCalendarId(''); showToast('Google Calendar disconnected.'); }
    catch (err) { setError(err.message); }
    finally { setGoogleLoading(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Migration Center</h1>
        <p className="mt-1 text-sm text-slate-500">Move business history into GigWorks with a review before anything is added.</p>
      </div>

      {!preview && !result && (
        <form onSubmit={handlePreview} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
            <div className="font-semibold">Designed to preserve your records</div>
            <p className="mt-1">Clients are matched only by exact email or phone. Every Google Calendar event becomes its own booking, even when several bookings belong to the same client. Past events are imported into Completed Bookings so the client’s history is preserved without crowding the active list.</p>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">1. Where is your data coming from?</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SOURCE_OPTIONS.map((option) => <button key={option.id} type="button" onClick={() => changeSource(option.id)} className={`rounded-xl border p-4 text-left ${sourceType === option.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300'}`}><div className="font-semibold text-slate-800">{option.name}</div><div className="mt-1 text-xs text-slate-500">{option.description}</div></button>)}
            </div>
          </div>

          {sourceType && <div>
            <label htmlFor="migration-name" className="mb-2 block text-sm font-semibold text-slate-700">Migration name</label>
            <input id="migration-name" value={migrationName} onChange={(e) => setMigrationName(e.target.value)} maxLength={160} className="w-full max-w-lg rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="Example: PandaDoc migration — September 2026" />
          </div>}

          {sourceType === 'pandadoc' && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><div className="font-semibold">PandaDoc export checklist</div><ol className="mt-2 list-decimal space-y-1 pl-5"><li>Ask PandaDoc Support for the workspace contact export.</li><li>In PandaDoc Reports, export Document data or Data analytics as CSV.</li><li>Upload both files below. GigWorks recognizes comma- and semicolon-separated exports.</li></ol><p className="mt-2 text-xs text-slate-500">Original signed PDFs are not uploaded in this step. Keep the PandaDoc bulk download available for the document-attachment phase.</p></div>}
          {sourceType === 'google_calendar' && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">Google Calendar connection</div><p className="mt-1 text-xs text-slate-500">Read-only access lets GigWorks load a calendar directly into the same safe preview. It cannot edit or delete Google events.</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${googleConnection?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500'}`}>{googleConnection?.connected ? 'Connected' : 'Not connected'}</span></div>
            {googleConnection?.connected ? <div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-64 flex-1"><span className="mb-1 block text-xs font-semibold">Calendar to import</span><select value={googleCalendarId} onChange={(event) => { setGoogleCalendarId(event.target.value); resetPreview(); }} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{googleCalendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.primary ? ' (Primary)' : ''}</option>)}</select></label><button type="button" onClick={disconnectGoogle} disabled={googleLoading} className="min-h-11 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-600">Disconnect</button></div> : <div className="mt-4"><button type="button" onClick={connectGoogle} disabled={googleLoading || !googleConnection?.configured} className="rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{googleLoading ? 'Checking…' : 'Connect Google Calendar'}</button>{googleConnection && !googleConnection.configured && <p className="mt-2 text-xs text-amber-700">Google OAuth credentials must be configured by GigWorks before direct connection is available.</p>}</div>}
            <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-indigo-700">Use a downloaded .ics file instead</summary><ol className="mt-2 list-decimal space-y-1 pl-5 text-xs"><li>Open Google Calendar Settings.</li><li>Select Import &amp; export, then Export.</li><li>Open the ZIP and choose the calendar’s .ics file below.</li></ol></details>
          </div>}

          {sourceType && <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="clients-file" className="mb-2 block text-sm font-semibold text-slate-700">{sourceType === 'pandadoc' ? 'PandaDoc contacts' : 'Client list'} (.csv)</label>
              <input id="clients-file" type="file" accept=".csv,text/csv" onChange={(e) => { setClientFile(e.target.files?.[0] || null); resetPreview(); }} className={fileClass} />
              <p className="mt-2 text-xs text-slate-500">Supports Name or First Name/Last Name, Email, Phone, Address, City, State, ZIP, and Notes.</p>
            </div>
            {(sourceType === 'google_calendar' || sourceType === 'other') && <div>
              <label htmlFor="calendar-file" className="mb-2 block text-sm font-semibold text-slate-700">{googleConnection?.connected ? 'Optional Google Calendar export (.ics)' : 'Google Calendar export (.ics)'}</label>
              <input id="calendar-file" type="file" accept=".ics,text/calendar" onChange={(e) => { setCalendarFile(e.target.files?.[0] || null); resetPreview(); }} className={fileClass} />
              <p className="mt-2 text-xs text-slate-500">In Google Calendar: Settings → Import & export → Export. Google’s .ics file normally contains previous and upcoming events; both are included in the preview.</p>
            </div>}
            {sourceType === 'pandadoc' && <div>
              <label htmlFor="pandadoc-file" className="mb-2 block text-sm font-semibold text-slate-700">PandaDoc document report (.csv)</label>
              <input id="pandadoc-file" type="file" accept=".csv,text/csv" onChange={(e) => { setPandaDocFile(e.target.files?.[0] || null); resetPreview(); }} className={fileClass} />
              <p className="mt-2 text-xs text-slate-500">Each PandaDoc document remains a separate booking with its status, dates, amount, source ID, and original link.</p>
            </div>}
          </div>}
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <button type="submit" disabled={working || !sourceType || (!clientFile && !calendarFile && !pandaDocFile && !(sourceType === 'google_calendar' && googleConnection?.connected && googleCalendarId))} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{working ? 'Checking files…' : 'Preview migration'}</button>
        </form>
      )}

      {preview && !result && (
        <>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900"><span className="font-semibold">Nothing has been imported yet.</span> Review the summary and any client matches below. GigWorks will only add these records after you select Confirm and import.</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Client rows" value={preview.summary.clientRows} />
            <Stat label="New clients" value={preview.summary.clientsToCreate} tone="green" />
            <Stat label="Matched clients" value={preview.summary.clientsMatched} />
            <Stat label="Separate bookings" value={preview.summary.bookingsToCreate} tone="green" />
            <Stat label="Rows needing attention" value={preview.summary.clientsNeedReview + preview.summary.skippedInvalidRows} tone={preview.summary.clientsNeedReview + preview.summary.skippedInvalidRows ? 'amber' : 'slate'} />
          </div>

          {(preview.errors.clients.length > 0 || preview.errors.calendar.length > 0 || preview.errors.pandaDoc.length > 0) && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="font-bold text-amber-900">Skipped rows</h2>
              <p className="mt-1 text-sm text-amber-800">These entries will not be imported until corrected in the source file.</p>
              <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm text-amber-900">
                {preview.errors.clients.map((item, index) => <li key={`c-${index}`}>CSV row {item.rowNumber || 'limit'}: {item.messages.join(' ')}</li>)}
                {preview.errors.calendar.map((item, index) => <li key={`e-${index}`}>Calendar event {item.eventNumber || 'limit'}{item.title ? ` (${item.title})` : ''}: {item.messages.join(' ')}</li>)}
                {preview.errors.pandaDoc.map((item, index) => <li key={`p-${index}`}>PandaDoc row {item.rowNumber || 'limit'}{item.title ? ` (${item.title})` : ''}: {item.messages.join(' ')}</li>)}
              </ul>
            </section>
          )}

          {preview.clients.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Review client matches</h2>
              <p className="mt-1 text-sm text-slate-500">Exact matches are suggested. Ambiguous records must be explicitly linked, created, or skipped.</p>
              <div className="mt-4 divide-y divide-slate-100">
                {preview.clients.filter((client) => !client.linkedRowId).map((client) => (
                  <div key={client.rowId} className="grid gap-3 py-4 md:grid-cols-[1fr_1.4fr] md:items-center">
                    <div><div className="font-semibold text-slate-800">{client.firstName} {client.lastName}</div><div className="text-xs text-slate-500">{client.email || 'No email'} · {client.phone || 'No phone'} · CSV row {client.rowNumber}</div></div>
                    <select value={decisions[client.rowId] || ''} onChange={(e) => setDecisions((current) => ({ ...current, [client.rowId]: e.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                      {client.recommendation === 'review' && <option value="">Choose what to do…</option>}
                      <option value="create">Create a separate new client</option>
                      {client.candidates.map((candidate) => <option key={candidate.id} value={`existing:${candidate.id}`}>Use existing: {candidate.firstName} {candidate.lastName} ({candidate.email || candidate.phone})</option>)}
                      <option value="skip">Skip this client</option>
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}

          {preview.bookings.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Bookings that will be created</h2>
              <p className="mt-1 text-sm text-slate-500">Each row below stays a separate booking. No events are merged by client, name, or date. {preview.summary.historicalBookings} past event{preview.summary.historicalBookings === 1 ? '' : 's'} will appear under Completed Bookings.</p>
              {preview.summary.bookingsWithoutSourceId > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{preview.summary.bookingsWithoutSourceId} record{preview.summary.bookingsWithoutSourceId === 1 ? '' : 's'} lack a source ID. Avoid importing the same file again, because those records cannot be recognized across separate migration attempts.</div>}
              <div className="mt-4 max-h-80 divide-y divide-slate-100 overflow-auto">
                {preview.bookings.map((booking) => <div key={`${booking.sourceType}-${booking.rowId}`} className="flex items-start justify-between gap-4 py-3"><div><div className="font-semibold text-slate-800">{booking.eventName}</div><div className="text-xs text-slate-500">{booking.source} · {booking.eventDate}{booking.startTime ? ` at ${booking.startTime}` : ' · all day'}{booking.location ? ` · ${booking.location}` : ''}</div></div><div className="text-right text-xs text-slate-500"><div>{booking.historical ? 'Completed booking' : 'Active booking'}</div><div>{booking.clientMatch ? 'Client matched' : booking.clientMatchAmbiguous ? 'Client needs manual assignment later' : 'No client match'}</div></div></div>)}
              </div>
            </section>
          )}

          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleCommit} disabled={working || unresolved > 0} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{working ? 'Importing…' : unresolved ? `Resolve ${unresolved} client match${unresolved === 1 ? '' : 'es'}` : 'Confirm and import'}</button>
            <button type="button" onClick={resetPreview} disabled={working} className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Choose different files</button>
          </div>
        </>
      )}

      {result && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-xl font-bold text-emerald-900">Import complete</h2>
          <p className="mt-2 text-sm text-emerald-800">Created {result.clientsCreated} clients and {result.bookingsCreated} separate bookings. Linked {result.clientsLinked} imported client records to existing clients and skipped {result.clientsSkipped}.</p>
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => navigate('/bookings')} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">View bookings</button><button type="button" onClick={downloadReport} className="rounded-xl border border-emerald-400 bg-white px-4 py-2 text-sm font-semibold text-emerald-800">Download migration report</button><button type="button" onClick={() => { setClientFile(null); setCalendarFile(null); setPandaDocFile(null); setSourceType(''); resetPreview(); }} className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800">Start another migration</button></div>
        </section>
      )}
    </div>
  );
}
