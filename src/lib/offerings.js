import { apiFetch } from '../context/AuthContext';
import { queryList } from './listQuery';

export function queryOfferings(params) {
  return queryList('/offerings', 'offerings', params);
}

export async function getAllOfferings() {
  const items = [];
  let cursor = '';
  do {
    const query = new URLSearchParams({ limit: '500' });
    if (cursor) query.set('cursor', cursor);
    const data = await apiFetch(`/offerings?${query}`);
    items.push(...(data.offerings || []));
    cursor = data.nextCursor || '';
  } while (cursor);
  return items;
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

export async function syncCatalog(offerings, contractorGroups) {
  return apiFetch('/catalog/sync', { method: 'POST', body: JSON.stringify({ offerings, contractorGroups }) });
}

export function computeOfferingTotal(offering) {
  if (!offering) return 0;
  if (offering.type === 'package') {
    const base = Number(offering.amount) || 0;
    return base + (offering.lineItems || []).reduce((sum, item) => {
      if (item.selected === false) return sum;
      const rate = Number(item.rate) || 0;
      if (item.pricingType === 'flat') return sum + rate;
      const chargeable = Math.max(0, (Number(item.quantity) || 0) - (Number(item.includedQuantity) || 0));
      return sum + chargeable * rate;
    }, 0);
  }
  if (offering.type === 'perUnit') {
    return (Number(offering.unitCount) || 0) * (Number(offering.ratePerUnit) || 0);
  }
  return Number(offering.amount) || 0;
}

export function computeOfferingsTotal(offerings) {
  return (offerings || []).reduce((sum, o) => sum + computeOfferingTotal(o), 0);
}

export function packageLineSummary(offering) {
  if (offering?.type !== 'package') return '';
  return (offering.lineItems || []).filter((item) => item.selected !== false).map((item) => {
    if (item.pricingType === 'flat') return `• ${item.name}`;
    const quantity = Number(item.quantity) || 0;
    const included = Number(item.includedQuantity) || 0;
    const extra = Math.max(0, quantity - included);
    return `• ${item.name}: ${quantity} ${item.unitType}${quantity === 1 ? '' : 's'}${included ? ` (${included} included${extra ? `, ${extra} additional` : ''})` : ''}`;
  }).join('\n');
}
