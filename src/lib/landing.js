import { apiFetch } from '../context/AuthContext';

export async function getLandingConfig() {
  return apiFetch('/landing/config');
}

export async function joinWaitlist({ name, email, businessName, selectedPlan, billingInterval }) {
  return apiFetch('/landing/waitlist', {
    method: 'POST',
    body: JSON.stringify({ name, email, businessName, selectedPlan, billingInterval }),
  });
}

export async function sendContactMessage({ name, email, message }) {
  return apiFetch('/landing/contact', {
    method: 'POST',
    body: JSON.stringify({ name, email, message }),
  });
}
