import { apiFetch, API_BASE } from '../context/AuthContext';
import { uploadToSignedUrl } from './directUpload';

function queryString(filters = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
  return query.size ? `?${query}` : '';
}

export async function getFinancialSummary(filters) {
  const data = await apiFetch(`/financials/summary${queryString(filters)}`);
  return data.summary;
}

export async function getFinancialReports(filters) {
  const data = await apiFetch(`/financials/reports${queryString(filters)}`);
  return data.reports;
}

export async function listFinancialTransactions(filters) {
  return apiFetch(`/financials${queryString(filters)}`);
}

export async function createFinancialExpense(expense) {
  const data = await apiFetch('/financials/expenses', { method: 'POST', body: JSON.stringify(expense) });
  return data.transaction;
}

export async function uploadFinancialReceipt(transactionId, file) {
  const metadata = { filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size };
  const upload = await apiFetch(`/financials/${transactionId}/receipt-upload-url`, { method: 'POST', body: JSON.stringify(metadata) });
  await uploadToSignedUrl(upload, file);
  const data = await apiFetch(`/financials/${transactionId}/receipt`, { method: 'POST', body: JSON.stringify({ ...metadata, storageKey: upload.storageKey }) });
  return data.receipt;
}

export function financialReceiptUrl(transactionId, download = false) {
  return `${API_BASE}/financials/${encodeURIComponent(transactionId)}/receipt${download ? '?download=1' : ''}`;
}

export async function reverseFinancialTransaction(id, reason) {
  const data = await apiFetch(`/financials/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) });
  return data.transaction;
}

export async function updateContractorPayment(eventId, assignmentId, patch) {
  const data = await apiFetch(`/financials/contractor-payments/${eventId}/${assignmentId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.payment;
}

export async function authorizeFinancialExport(report, format, filters) {
  return apiFetch('/financials/export-events', { method: 'POST', body: JSON.stringify({ report, format, filters }) });
}
