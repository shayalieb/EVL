import { apiFetch } from '../context/AuthContext';
import { fetchAllPages } from './fetchAllPages';
import { queryList } from './listQuery';

export async function listEvents() {
  return fetchAllPages('/events', 'events');
}

export function queryEvents(params) {
  return queryList('/events', 'events', params);
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
