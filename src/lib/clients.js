import { apiFetch } from '../context/AuthContext';
import { queryList } from './listQuery';

export async function findInquiryClientCandidates({ firstName = '', lastName = '', email = '', phone = '' } = {}) {
  const params = new URLSearchParams({ firstName, lastName, email, phone });
  const data = await apiFetch(`/clients/matches/inquiry?${params}`);
  return data.candidates || [];
}

export function queryClients(params) {
  return queryList('/clients', 'clients', params);
}

export async function getClient(id) {
  const data = await apiFetch(`/clients/${encodeURIComponent(id)}`);
  return data.client;
}

export async function createClient(patch) {
  const data = await apiFetch('/clients', { method: 'POST', body: JSON.stringify(patch) });
  return data.client;
}

export async function updateClientApi(id, patch) {
  const data = await apiFetch(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.client;
}

export async function deleteClientApi(id) {
  return apiFetch(`/clients/${id}`, { method: 'DELETE' });
}
