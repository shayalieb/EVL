import { apiFetch } from '../context/AuthContext';

export async function listEvents() {
  const data = await apiFetch('/events');
  return data.events;
}

// Full record, including the heavy categoryTabs/schedule/prepGroups/
// requests/shotList/secondShooters/otherExpenses/history fields the list
// route omits — see server/src/routes/events.js.
export async function getEvent(id) {
  const data = await apiFetch(`/events/${id}`);
  return data.event;
}

export async function createEvent(patch) {
  const data = await apiFetch('/events', { method: 'POST', body: JSON.stringify(patch) });
  return data.event;
}

export async function updateEventApi(id, patch) {
  const data = await apiFetch(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.event;
}
