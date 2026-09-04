import { apiFetch } from '../context/AuthContext';

export async function getQuickBooksStatus() {
  const data = await apiFetch('/integrations/quickbooks/status');
  return data.connection;
}

export async function beginQuickBooksConnection() {
  const data = await apiFetch('/integrations/quickbooks/connect-url', { method: 'POST' });
  return data.url;
}

export async function disconnectQuickBooks() {
  const data = await apiFetch('/integrations/quickbooks/connection', { method: 'DELETE' });
  return data.connection;
}

export async function checkQuickBooksConnection() {
  const data = await apiFetch('/integrations/quickbooks/health', { method: 'POST' });
  return data.connection;
}

export async function getQuickBooksSetup() {
  const data = await apiFetch('/integrations/quickbooks/setup');
  return data.setup;
}

export async function refreshQuickBooksReferenceData() {
  const data = await apiFetch('/integrations/quickbooks/reference-data', { method: 'POST' });
  return data.setup;
}

export async function saveQuickBooksMappings(mappings) {
  const data = await apiFetch('/integrations/quickbooks/mappings', { method: 'PUT', body: JSON.stringify(mappings) });
  return data.setup;
}

export async function getQuickBooksSyncPreview() {
  return apiFetch('/integrations/quickbooks/sync/preview');
}

export async function findQuickBooksCustomerMatches(clientId) {
  return apiFetch(`/integrations/quickbooks/sync/customers/${encodeURIComponent(clientId)}/matches`);
}

export async function linkQuickBooksCustomer(clientId, quickBooksId) {
  return apiFetch(`/integrations/quickbooks/sync/customers/${encodeURIComponent(clientId)}/link`, { method: 'POST', body: JSON.stringify({ quickBooksId }) });
}

export async function createQuickBooksCustomer(clientId) {
  return apiFetch(`/integrations/quickbooks/sync/customers/${encodeURIComponent(clientId)}/create`, { method: 'POST' });
}

export async function getQuickBooksVendorPreview() {
  return apiFetch('/integrations/quickbooks/sync/vendors/preview');
}

export async function findQuickBooksVendorMatches(contractorId) {
  return apiFetch(`/integrations/quickbooks/sync/vendors/${encodeURIComponent(contractorId)}/matches`);
}

export async function linkQuickBooksVendor(contractorId, quickBooksId) {
  return apiFetch(`/integrations/quickbooks/sync/vendors/${encodeURIComponent(contractorId)}/link`, { method: 'POST', body: JSON.stringify({ quickBooksId }) });
}

export async function createQuickBooksVendor(contractorId) {
  return apiFetch(`/integrations/quickbooks/sync/vendors/${encodeURIComponent(contractorId)}/create`, { method: 'POST' });
}

export async function getQuickBooksBillPreview() {
  return apiFetch('/integrations/quickbooks/sync/bills/preview');
}

export async function syncQuickBooksBill(eventId, assignmentId) {
  return apiFetch(`/integrations/quickbooks/sync/bills/${encodeURIComponent(eventId)}/${encodeURIComponent(assignmentId)}/sync`, { method: 'POST' });
}

export async function syncQuickBooksInvoice(invoiceId) {
  return apiFetch(`/integrations/quickbooks/sync/invoices/${encodeURIComponent(invoiceId)}/sync`, { method: 'POST' });
}

export async function getQuickBooksPaymentPreview() {
  return apiFetch('/integrations/quickbooks/sync/payments/preview');
}

export async function syncQuickBooksPayment(transactionId) {
  return apiFetch(`/integrations/quickbooks/sync/payments/${encodeURIComponent(transactionId)}/sync`, { method: 'POST' });
}

export async function manuallyReconcileQuickBooksPayment(transactionId, note) {
  return apiFetch(`/integrations/quickbooks/sync/payments/${encodeURIComponent(transactionId)}/manual`, { method: 'POST', body: JSON.stringify({ note }) });
}

export async function reconcileQuickBooksPayment(transactionId) {
  return apiFetch(`/integrations/quickbooks/sync/payments/${encodeURIComponent(transactionId)}/reconcile`, { method: 'POST' });
}
