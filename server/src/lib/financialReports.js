export function dateDaysBetween(later, earlier) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate()) - Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate())) / dayMs);
}

export function receivableAgingBucket(dueDate, asOf) {
  if (!dueDate || dueDate > asOf) return 'current';
  const days = dateDaysBetween(asOf, dueDate);
  if (days <= 0) return 'current';
  if (days <= 30) return 'days1to30';
  if (days <= 60) return 'days31to60';
  if (days <= 90) return 'days61to90';
  return 'days90plus';
}

function durationHours(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return null;
  let minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return minutes / 60;
}

export function contractorAssignmentCost(booking, contractor) {
  const tiers = contractor?.pricingTiers || [];
  const tier = tiers.find((item) => item.id === booking.pricingTierId) || tiers[0];
  if (!tier) return null;
  let overtimeHours = 0;
  if (Number(tier.includedHours) > 0 && Number(tier.overtimeRate) > 0) {
    if (booking.overtimeHoursOverride !== null && booking.overtimeHoursOverride !== undefined && booking.overtimeHoursOverride !== '') overtimeHours = Math.max(0, Number(booking.overtimeHoursOverride) || 0);
    else {
      const actual = durationHours(booking.startTime, booking.endTime);
      overtimeHours = actual === null ? 0 : Math.max(0, actual - Number(tier.includedHours));
    }
  }
  return (Number(tier.price) || 0) + overtimeHours * (Number(tier.overtimeRate) || 0);
}

export function inIsoDateRange(value, from, to) {
  if (!value) return !from && !to;
  return (!from || value >= from) && (!to || value <= to);
}

export function proposalSnapshotTotal(proposal) {
  const lineItems = (proposal?.lineItems || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const offerings = (proposal?.offerings || []).reduce((sum, item) => sum + (item?.type === 'perUnit' ? (Number(item.unitCount) || 0) * (Number(item.ratePerUnit) || 0) : Number(item?.amount) || 0), 0);
  return lineItems + offerings;
}

export function financialMonthSequence(start, count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    return { key: date.toISOString().slice(0, 7), label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) };
  });
}
