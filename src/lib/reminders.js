import { apiFetch } from '../context/AuthContext';

export async function fetchReminders() {
  const data = await apiFetch('/reminders');
  return data.reminders;
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
