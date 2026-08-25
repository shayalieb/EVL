import { apiFetch } from '../context/AuthContext';
import { fetchAllPages } from './fetchAllPages';
import { queryList } from './listQuery';

export async function listEvents() {
  return fetchAllPages('/events', 'events');
}

export function queryEvents(params) {
  return queryList('/events', 'events', params);
}

// Calendar screens need every event in the visible grid, but never the
// account's full history. Fetch all pages within that bounded date range.
export async function queryEventRange(params) {
  const pageSize = 100;
  const first = await queryEvents({ ...params, page: 1, pageSize });
  const inRange = (item) => item.eventDate >= params.from && item.eventDate <= params.to;
  if (first.pageCount <= 1) return first.items.filter(inRange);
  const remaining = await Promise.all(
    Array.from({ length: first.pageCount - 1 }, (_, index) =>
      queryEvents({ ...params, page: index + 2, pageSize })),
  );
  return [first, ...remaining].flatMap((result) => result.items).filter(inRange);
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
