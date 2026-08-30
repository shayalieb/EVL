import { apiFetch } from '../context/AuthContext';

export async function listAgencyGroups() { const data = await apiFetch('/agency-groups'); return data.groups; }
export async function createAgencyGroup(patch) { const data = await apiFetch('/agency-groups', { method: 'POST', body: JSON.stringify(patch) }); return data.group; }
export async function updateAgencyGroup(id, patch) { const data = await apiFetch(`/agency-groups/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); return data.group; }
export async function deleteAgencyGroup(id) { return apiFetch(`/agency-groups/${id}`, { method: 'DELETE' }); }
