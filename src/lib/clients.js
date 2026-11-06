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

export async function getClientOverview(id) {
  return apiFetch(`/clients/${encodeURIComponent(id)}/overview`);
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

export const CLIENT_NOTE_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'preference', label: 'Preference' },
  { value: 'issue', label: 'Issue' },
];

export async function listClientNotes(clientId) {
  const data = await apiFetch(`/clients/${encodeURIComponent(clientId)}/notes`);
  return data.notes;
}

export async function createClientNote(clientId, note) {
  const data = await apiFetch(`/clients/${encodeURIComponent(clientId)}/notes`, { method: 'POST', body: JSON.stringify(note) });
  return data.note;
}

export async function updateClientNote(clientId, noteId, patch) {
  const data = await apiFetch(`/clients/${encodeURIComponent(clientId)}/notes/${encodeURIComponent(noteId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.note;
}

export async function deleteClientNote(clientId, noteId) {
  return apiFetch(`/clients/${encodeURIComponent(clientId)}/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
}
