import { apiFetch } from '../context/AuthContext';
import { fetchAllPages } from './fetchAllPages';
import { queryList } from './listQuery';

export async function listBookings() {
  return fetchAllPages('/bookings', 'bookings');
}

export function queryBookings(params) {
  return queryList('/bookings', 'bookings', params);
}

// Full record, including the heavy schedule/activityLog/proposal/history
// fields the list route omits — see server/src/routes/bookings.js.
export async function getBooking(id) {
  const data = await apiFetch(`/bookings/${id}`);
  return data.booking;
}

export async function createBooking(patch) {
  const data = await apiFetch('/bookings', { method: 'POST', body: JSON.stringify(patch) });
  return data.booking;
}

export async function updateBookingApi(id, patch) {
  const data = await apiFetch(`/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.booking;
}
