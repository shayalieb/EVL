import { apiFetch } from '../context/AuthContext';

export async function getSubscriptionStatus() {
  return apiFetch('/subscription/status');
}

export async function startCheckout(tier, interval, groupCount) {
  const data = await apiFetch('/subscription/checkout', {
    method: 'POST',
    body: JSON.stringify({ tier, interval, groupCount }),
  });
  return data.url;
}

export async function openBillingPortal() {
  const data = await apiFetch('/subscription/portal', { method: 'POST' });
  return data.url;
}
