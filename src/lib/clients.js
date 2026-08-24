import { apiFetch } from '../context/AuthContext';
import { fetchAllPages } from './fetchAllPages';

export async function listClients() {
  return fetchAllPages('/clients', 'clients');
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
