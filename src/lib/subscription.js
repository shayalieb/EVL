import { apiFetch } from '../context/AuthContext';

export async function getSubscriptionStatus() {
  return apiFetch('/subscription/status');
}

export async function startCheckout(tier, interval) {
  const data = await apiFetch('/subscription/checkout', {
    method: 'POST',
    body: JSON.stringify({ tier, interval }),
  });
  return data.url;
}

export async function openBillingPortal() {
  const data = await apiFetch('/subscription/portal', { method: 'POST' });
  return data.url;
}
