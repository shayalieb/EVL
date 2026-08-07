import { apiFetch } from '../context/AuthContext';

export async function listEvents() {
  const data = await apiFetch('/events');
  return data.events;
}

export async function createEvent(patch) {
  const data = await apiFetch('/events', { method: 'POST', body: JSON.stringify(patch) });
  return data.event;
}

export async function updateEventApi(id, patch) {
  const data = await apiFetch(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.event;
}
