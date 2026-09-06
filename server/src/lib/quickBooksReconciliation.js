import { prisma } from './prisma.js';
import { mapWithConcurrency } from './concurrency.js';
import { queryQuickBooks, validQuickBooksAccess } from './quickBooks.js';

const ENTITY_NAMES = { invoice: 'Invoice', payment: 'Payment', bill: 'Bill', bill_payment: 'BillPayment' };
const POLL_INTERVAL_MS = 15 * 60 * 1000;

export function quickBooksReconciliationDue(connection, now = new Date()) {
  if (!connection?.reconciliationEnabled || connection.status !== 'active') return false;
  if (!connection.lastReconciliationAt) return true;
  return now.getTime() - new Date(connection.lastReconciliationAt).getTime() >= Math.max(1, connection.reconciliationFrequencyHours || 24) * 3600000;
}

export async function reconcileQuickBooksConnection(connection) {
  const { accessToken, tokenData } = await validQuickBooksAccess(connection);
  const links = await prisma.quickBooksEntityLink.findMany({ where: { accountId: connection.accountId, entityType: { in: Object.keys(ENTITY_NAMES) }, status: 'synced', quickBooksId: { not: null } }, orderBy: { updatedAt: 'asc' }, take: 500 });
  let reviewed = 0;
  let mismatches = 0;
  for (const [entityType, entityName] of Object.entries(ENTITY_NAMES)) {
    const scoped = links.filter((link) => link.entityType === entityType && /^\d+$/.test(link.quickBooksId));
    for (let index = 0; index < scoped.length; index += 50) {
      const batch = scoped.slice(index, index + 50);
      const ids = batch.map((link) => `'${link.quickBooksId}'`).join(',');
      const response = await queryQuickBooks({ realmId: connection.realmId, accessToken, query: `select * from ${entityName} where Id in (${ids}) maxresults 50` });
      const remoteById = new Map((response[entityName] || []).map((record) => [String(record.Id), record]));
      for (const link of batch) {
        reviewed += 1;
        const remote = remoteById.get(link.quickBooksId);
        const changed = !remote || String(remote.SyncToken || '') !== String(link.quickBooksSyncToken || '');
        if (!changed) continue;
        mismatches += 1;
        const message = remote ? 'This record changed in QuickBooks and needs review.' : 'This record no longer exists in QuickBooks.';
        await prisma.$transaction([
          prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { status: 'needs_review', lastError: message, lastSyncedAt: new Date() } }),
          prisma.quickBooksSyncLog.create({ data: { accountId: connection.accountId, entityType, localId: link.localId, action: 'scheduled_reconciliation', status: 'needs_review', message } }),
        ]);
      }
    }
  }
  await prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { ...(tokenData || {}), lastReconciliationAt: new Date(), lastReconciliationStatus: mismatches ? 'needs_review' : 'healthy', lastError: null } });
  if (mismatches) await prisma.accountActivity.create({ data: { accountId: connection.accountId, type: 'quickbooks_reconciliation_alert', summary: `${mismatches} QuickBooks record${mismatches === 1 ? '' : 's'} need review`, metadata: { mismatches, reviewed } } });
  return { reviewed, mismatches };
}

let running = false;
export async function tick() {
  if (running) return;
  running = true;
  try {
    const connections = await prisma.quickBooksConnection.findMany({ where: { status: 'active', reconciliationEnabled: true }, take: 100 });
    const due = connections.filter((connection) => quickBooksReconciliationDue(connection));
    const results = await mapWithConcurrency(due, 2, reconcileQuickBooksConnection);
    await Promise.all(results.map((result, index) => result.status === 'rejected' ? prisma.quickBooksConnection.update({ where: { id: due[index].id }, data: { lastReconciliationAt: new Date(), lastReconciliationStatus: 'failed', lastError: String(result.reason?.message || result.reason).slice(0, 500) } }) : null));
  } catch (error) { console.error('QuickBooks reconciliation tick failed:', error); }
  finally { running = false; }
}

export function startQuickBooksReconciliationScheduler() {
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
