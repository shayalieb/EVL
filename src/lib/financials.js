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

export async function getFinancialForecast(filters) {
  const data = await apiFetch(`/financials/forecast${queryString(filters)}`);
  return data.forecast;
}

export async function saveFinancialBudget(month, budget) {
  const data = await apiFetch(`/financials/budgets/${month}`, { method: 'PUT', body: JSON.stringify(budget) });
  return data.budget;
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

export async function listSavedFinancialViews() {
  const data = await apiFetch('/financials/saved-views');
  return data.views;
}

export async function saveFinancialView(view) {
  const data = await apiFetch('/financials/saved-views', { method: 'POST', body: JSON.stringify(view) });
  return data.view;
}

export async function deleteFinancialView(id) {
  return apiFetch(`/financials/saved-views/${id}`, { method: 'DELETE' });
}
