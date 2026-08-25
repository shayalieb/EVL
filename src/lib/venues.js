import { apiFetch } from '../context/AuthContext';
import { queryList } from './listQuery';

export function queryVenues(params) {
  return queryList('/venues', 'venues', params);
}

export async function getVenue(id) {
  const data = await apiFetch(`/venues/${encodeURIComponent(id)}`);
  return data.venue;
}

export async function createVenue(venue) {
  const data = await apiFetch('/venues', { method: 'POST', body: JSON.stringify(venue) });
  return data.venue;
}

export async function updateVenueApi(id, patch) {
  const data = await apiFetch(`/venues/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.venue;
}

export async function deleteVenueApi(id) {
  return apiFetch(`/venues/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
