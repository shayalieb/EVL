import { apiFetch } from '../context/AuthContext';

// `all` opts into the full history (used by the Reminders page's Completed
// tab); the default omits old completed rows so the nav bell's 60s poll and
// the page's normal Pending view aren't pulling an ever-growing account's
// entire reminder history on every request — see server/src/routes/
// reminders.js's GET / for the actual cutoff.
export async function fetchReminders({ all = false } = {}) {
  const data = await apiFetch(`/reminders${all ? '?all=true' : ''}`);
  return data.reminders;
}

// Where clicking a reminder's related-record badge/name should go — null
// when there's nothing to link to (no relatedId) or when the type has no
// dedicated detail page of its own (invoice; see ReminderModal.jsx, which
// resolves an invoice's own booking instead since it already loads the
// invoice list for the picker).
export function relatedRecordPath(reminder) {
  if (!reminder?.relatedType || !reminder?.relatedId) return null;
  switch (reminder.relatedType) {
    case 'client': return `/clients?open=${reminder.relatedId}`;
    case 'contractor': return `/contractors?open=${reminder.relatedId}`;
    case 'event': return `/events/${reminder.relatedId}`;
    case 'booking': return `/bookings/${reminder.relatedId}`;
    default: return null;
  }
}

export async function createReminder(reminder) {
  const data = await apiFetch('/reminders', { method: 'POST', body: JSON.stringify(reminder) });
  return data.reminder;
}

export async function updateReminder(id, patch) {
  const data = await apiFetch(`/reminders/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.reminder;
}

export async function completeReminder(id, completed) {
  const data = await apiFetch(`/reminders/${id}/complete`, { method: 'PATCH', body: JSON.stringify({ completed }) });
  return data.reminder;
}

export async function deleteReminder(id) {
  return apiFetch(`/reminders/${id}`, { method: 'DELETE' });
}
