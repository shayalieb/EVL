import { apiFetch } from '../context/AuthContext';

export async function getConnectStatus() {
  return apiFetch('/billing/connect-status');
}

export async function startStripeConnect() {
  const data = await apiFetch('/billing/connect', { method: 'POST' });
  return data.url;
}

export async function refreshConnectStatus() {
  return apiFetch('/billing/refresh-status', { method: 'POST' });
}
