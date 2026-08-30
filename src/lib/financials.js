import { apiFetch } from '../context/AuthContext';

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

export async function reverseFinancialTransaction(id, reason) {
  const data = await apiFetch(`/financials/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) });
  return data.transaction;
}
