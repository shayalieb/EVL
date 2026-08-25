import { apiFetch } from '../context/AuthContext';
import { queryList } from './listQuery';

export function queryOfferings(params) {
  return queryList('/offerings', 'offerings', params);
}

export async function getOffering(id) {
  const data = await apiFetch(`/offerings/${encodeURIComponent(id)}`);
  return data.offering;
}

export async function createOffering(offering) {
  const data = await apiFetch('/offerings', { method: 'POST', body: JSON.stringify(offering) });
  return data.offering;
}

export async function updateOfferingApi(id, patch) {
  const data = await apiFetch(`/offerings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.offering;
}

export async function deleteOfferingApi(id) {
  return apiFetch(`/offerings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function computeOfferingTotal(offering) {
  if (!offering) return 0;
  if (offering.type === 'perUnit') {
    return (Number(offering.unitCount) || 0) * (Number(offering.ratePerUnit) || 0);
  }
  return Number(offering.amount) || 0;
}

export function computeOfferingsTotal(offerings) {
  return (offerings || []).reduce((sum, o) => sum + computeOfferingTotal(o), 0);
}
