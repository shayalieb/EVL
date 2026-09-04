import { apiFetch } from '../context/AuthContext';

export async function getMessagingProfile() {
  const data = await apiFetch('/messaging/profile');
  return data.profile;
}

export async function requestMessagingActivation(input) {
  const data = await apiFetch('/messaging/profile/request', { method: 'PUT', body: JSON.stringify(input) });
  return data.profile;
}

export async function updateSmsConsent(contractorId, status) {
  return apiFetch(`/messaging/contractors/${encodeURIComponent(contractorId)}/consent`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function sendSmsMessage({ eventId, contractorId, body }) {
  return apiFetch('/messaging/send', { method: 'POST', body: JSON.stringify({ eventId, contractorId, body }) });
}
