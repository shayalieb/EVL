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
