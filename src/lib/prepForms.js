import { apiFetch } from '../context/AuthContext';

export async function getPrepFormLink(eventId) { return apiFetch(`/prep-forms/${encodeURIComponent(eventId)}`); }
export async function emailPrepFormLink(eventId, email) { return apiFetch(`/prep-forms/${encodeURIComponent(eventId)}/email`, { method: 'POST', body: JSON.stringify({ email }) }); }
export async function markPrepFormReviewed(eventId) { return apiFetch(`/prep-forms/${encodeURIComponent(eventId)}/reviewed`, { method: 'POST' }); }
export async function getPublicPrepForm(token) { return apiFetch(`/prep-request/${encodeURIComponent(token)}`); }
export async function submitPublicPrepForm(token, payload) { return apiFetch(`/prep-request/${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify(payload) }); }
