import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { beginQuickBooksConnection, checkQuickBooksConnection, disconnectQuickBooks, getQuickBooksStatus } from '../../lib/quickBooks';

export default function IntegrationsTab() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const result = searchParams.get('quickbooks');
    if (result === 'connected') showToast('QuickBooks connected');
    if (result === 'error') showToast(searchParams.get('message') || 'Unable to connect QuickBooks', 'error');
    if (result) {
      const next = new URLSearchParams(searchParams);
      next.delete('quickbooks');
      next.delete('message');
      setSearchParams(next, { replace: true });
    }
    getQuickBooksStatus().then(setConnection).catch((error) => showToast(error.message, 'error')).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setWorking(true);
    try {
      const url = await beginQuickBooksConnection();
      window.location.assign(url);
    } catch (error) {
      showToast(error.message || 'Unable to start the QuickBooks connection', 'error');
      setWorking(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect QuickBooks from this GigWorks account? Existing QuickBooks records will not be deleted.')) return;
    setWorking(true);
    try {
      setConnection(await disconnectQuickBooks());
      showToast('QuickBooks disconnected');
    } catch (error) {
      showToast(error.message || 'Unable to disconnect QuickBooks', 'error');
    } finally {
      setWorking(false);
    }
  }

  async function checkConnection() {
    setWorking(true);
    try {
      setConnection(await checkQuickBooksConnection());
      showToast('QuickBooks connection is healthy');
    } catch (error) {
      showToast(error.message || 'QuickBooks needs to be reconnected', 'error');
      getQuickBooksStatus().then(setConnection).catch(() => {});
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading integrations…</p>;
  const connected = connection?.connected;
  return <div className="max-w-3xl space-y-5">
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-lg font-black text-white">qb</div>
          <div><h3 className="font-bold text-slate-800">QuickBooks Online</h3><p className="mt-1 max-w-xl text-sm text-slate-500">Connect your accounting company so completed GigWorks financial activity can be reviewed and synchronized without duplicate entry.</p></div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{connected ? 'Connected' : 'Not connected'}</span>
      </div>
      {connected ? <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-slate-800">{connection.companyName || 'QuickBooks company'}</p><p className="mt-1 text-xs text-slate-500">Connected securely. Accounting synchronization will be enabled in the next integration phase.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={checkConnection} disabled={working} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{working ? 'Checking…' : 'Check connection'}</button><button type="button" onClick={disconnect} disabled={working} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Disconnect</button></div></div> : <div className="mt-5"><button type="button" onClick={connect} disabled={working || !connection?.configured} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{working ? 'Opening QuickBooks…' : connection?.status === 'needs_reauthorization' ? 'Reconnect QuickBooks' : 'Connect QuickBooks'}</button>{!connection?.configured && <p className="mt-2 text-xs text-amber-700">QuickBooks connection will become available after the Intuit production credentials are configured.</p>}</div>}
    </section>
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-5"><h3 className="font-bold text-slate-800">Planned synchronization</h3><div className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2"><p>✓ Clients and QuickBooks customers</p><p>✓ Invoices and client payments</p><p>✓ Contractors and vendors</p><p>✓ Contractor bills and payments</p></div><p className="mt-4 text-xs text-slate-500">Nothing is sent automatically during the connection phase. You will review account mappings and synchronization preferences first.</p></section>
  </div>;
}
