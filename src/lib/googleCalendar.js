import { apiFetch } from '../context/AuthContext';

export async function getGoogleCalendarStatus() { return (await apiFetch('/integrations/google-calendar/status')).connection; }
export async function beginGoogleCalendarConnection() { return (await apiFetch('/integrations/google-calendar/connect-url', { method: 'POST' })).url; }
export async function getGoogleCalendars() { return (await apiFetch('/integrations/google-calendar/calendars')).calendars; }
export function exportGoogleCalendar(calendarId) { return apiFetch('/integrations/google-calendar/export', { method: 'POST', body: JSON.stringify({ calendarId }) }); }
export async function disconnectGoogleCalendar() { return (await apiFetch('/integrations/google-calendar/connection', { method: 'DELETE' })).connection; }
