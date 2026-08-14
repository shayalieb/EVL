import { apiFetch } from '../context/AuthContext';

export async function joinWaitlist({ name, email, businessName }) {
  return apiFetch('/landing/waitlist', {
    method: 'POST',
    body: JSON.stringify({ name, email, businessName }),
  });
}

export async function sendContactMessage({ name, email, message }) {
  return apiFetch('/landing/contact', {
    method: 'POST',
    body: JSON.stringify({ name, email, message }),
  });
}
