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

export const CLIENT_STAGES = [
  { value: 'lead', label: 'Lead', color: '#0ea5e9' },
  { value: 'active', label: 'Active', color: '#059669' },
  { value: 'past', label: 'Past client', color: '#64748b' },
  { value: 'vip', label: 'VIP', color: '#d97706' },
  { value: 'do_not_contact', label: 'Do not contact', color: '#e11d48' },
];

export function stageInfo(value) {
  return CLIENT_STAGES.find((stage) => stage.value === value) || CLIENT_STAGES[0];
}

// Ready-made views. They use the same filter keys a saved view stores.
export const PRESET_CLIENT_VIEWS = [
  { id: 'preset:owes', name: 'Owes money', filters: { owes: true } },
  { id: 'preset:overdue', name: 'Follow-up overdue', filters: { followUp: 'overdue' } },
  { id: 'preset:silent', name: 'No contact in 60 days', filters: { noContactDays: 60 } },
  { id: 'preset:leads', name: 'Leads', filters: { stage: 'lead' } },
  { id: 'preset:past', name: 'Past clients (rebook outreach)', filters: { stage: 'past' } },
  { id: 'preset:vip', name: 'VIPs', filters: { stage: 'vip' } },
];

export async function updateClientClassification(clientId, patch) {
  const data = await apiFetch(`/clients/${encodeURIComponent(clientId)}/classification`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.client;
}

export async function listClientTags() {
  const data = await apiFetch('/clients/tags');
  return data.tags;
}

export async function listClientViews() {
  const data = await apiFetch('/clients/views');
  return data.views;
}

export async function createClientView(name, filters) {
  const data = await apiFetch('/clients/views', { method: 'POST', body: JSON.stringify({ name, filters }) });
  return data.view;
}

export async function deleteClientView(id) {
  return apiFetch(`/clients/views/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
