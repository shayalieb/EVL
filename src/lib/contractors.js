import { apiFetch } from '../context/AuthContext';

export async function listContractors() {
  const data = await apiFetch('/contractors');
  return data.contractors;
}

export async function createContractor(patch) {
  const data = await apiFetch('/contractors', { method: 'POST', body: JSON.stringify(patch) });
  return data.contractor;
}

export async function updateContractorApi(id, patch) {
  const data = await apiFetch(`/contractors/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.contractor;
}

export async function deleteContractorApi(id) {
  return apiFetch(`/contractors/${id}`, { method: 'DELETE' });
}
