import { apiFetch } from '../context/AuthContext';

export async function listPortalEvents() {
  const data = await apiFetch('/portal/events');
  return data.events;
}

export async function listPortalBookings() {
  const data = await apiFetch('/portal/bookings');
  return data.bookings;
}

export async function listPortalInvoices() {
  const data = await apiFetch('/portal/invoices');
  return data.invoices;
}
