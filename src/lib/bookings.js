import { apiFetch } from '../context/AuthContext';

export async function listBookings() {
  const data = await apiFetch('/bookings');
  return data.bookings;
}

export async function createBooking(patch) {
  const data = await apiFetch('/bookings', { method: 'POST', body: JSON.stringify(patch) });
  return data.booking;
}

export async function updateBookingApi(id, patch) {
  const data = await apiFetch(`/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.booking;
}
