import { apiFetch } from '../context/AuthContext';
import { fetchAllPages } from './fetchAllPages';
import { queryList } from './listQuery';

export async function listClients() {
  return fetchAllPages('/clients', 'clients');
}

export function queryClients(params) {
  return queryList('/clients', 'clients', params);
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
