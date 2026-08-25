import { apiFetch } from '../context/AuthContext';
import { queryList } from './listQuery';
import { getPricingTiers } from './pricingTiers';

export function queryContractorGroups(params) {
  return queryList('/contractor-groups', 'contractorGroups', params);
}

export async function getAllContractorGroups() {
  const items = [];
  let cursor = '';
  do {
    const query = new URLSearchParams({ limit: '500' });
    if (cursor) query.set('cursor', cursor);
    const data = await apiFetch(`/contractor-groups?${query}`);
    items.push(...(data.contractorGroups || []));
    cursor = data.nextCursor || '';
  } while (cursor);
  return items;
}

export async function getContractorGroup(id) {
  const data = await apiFetch(`/contractor-groups/${encodeURIComponent(id)}`);
  return data.contractorGroup;
}

export async function createContractorGroup(group) {
  const data = await apiFetch('/contractor-groups', { method: 'POST', body: JSON.stringify(group) });
  return data.contractorGroup;
}

export async function updateContractorGroupApi(id, patch) {
  const data = await apiFetch(`/contractor-groups/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.contractorGroup;
}

export async function deleteContractorGroupApi(id) {
  return apiFetch(`/contractor-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Instrument (Category) plus Role, e.g. "Violin — Principal" — still no
// name, just what they play and their role in the lineup. Falls back to
// whichever of the two is actually set, and only to the generic "Musician"
// when a contractor has neither on file.
export function formatInstrumentLine(contractor) {
  const instrument = contractor?.contractorType1?.trim();
  const role = contractor?.contractorType2?.trim();
  if (instrument && role) return `${instrument} — ${role}`;
  return instrument || role || 'Musician';
}

// Live sum of each current member's own rate (their first/cheapest pricing
// tier) — the same default-tier convention used when bulk-adding a group to
// an event roster. This is a suggestion, not a snapshot: it moves as
// contractors' rates or a group's membership change, right up until an
// ensemble offering is actually added to a proposal/contract, at which
// point the amount is frozen like everything else about that instance.
export function computeGroupSuggestedPrice(group, contractors) {
  return (group?.contractorIds || [])
    .map((id) => contractors.find((c) => c.id === id))
    .filter(Boolean)
    .reduce((sum, c) => sum + (Number(getPricingTiers(c)[0]?.price) || 0), 0);
}

// A group's effective price: its own flat/package price if one is set
// (can be cheaper or pricier than the sum of parts), otherwise the summed
// suggestion above.
export function computeGroupPrice(group, contractors) {
  if (group?.price !== '' && group?.price !== null && group?.price !== undefined) {
    const flat = Number(group.price);
    if (!Number.isNaN(flat)) return flat;
  }
  return computeGroupSuggestedPrice(group, contractors);
}
