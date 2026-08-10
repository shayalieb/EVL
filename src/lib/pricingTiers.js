// Contractors created before pricing tiers existed only have a flat
// `price` field — treat that as an implicit single "Standard" tier rather
// than requiring a one-time data migration.
export function getPricingTiers(contractor) {
  if (contractor?.pricingTiers?.length) return contractor.pricingTiers;
  if (contractor?.price !== undefined) return [{ id: 'legacy', name: 'Standard', price: Number(contractor.price) || 0 }];
  return [];
}

export function getPricingTier(contractor, pricingTierId) {
  const tiers = getPricingTiers(contractor);
  if (!tiers.length) return null;
  return tiers.find((t) => t.id === pricingTierId) || tiers[0];
}

export function getTierPrice(contractor, pricingTierId) {
  return getPricingTier(contractor, pricingTierId)?.price || 0;
}

// Moved here (from DataContext, which still re-exports it for existing
// callers) so overtime calculation below can share it without a circular
// import back into DataContext. Returns null (not 0) when either time is
// missing, so callers can tell "no times set" apart from "zero-length gig".
export function computeDurationHours(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60; // crosses midnight
  return minutes / 60;
}

// A tier only participates in overtime once it has both includedHours and
// overtimeRate set — a blank/zero on either means "this tier doesn't track
// overtime", not "unlimited free overtime" or "free overtime hours".
function tierHasOvertime(tier) {
  return !!tier && Number(tier.includedHours) > 0 && Number(tier.overtimeRate) > 0;
}

// booking.overtimeHoursOverride (manual mode) always wins when set — even
// 0, which is how a business would explicitly say "no overtime this time"
// despite what the booked times imply. Auto mode falls back to the booked
// start/end time against the tier's includedHours, clamped at 0 (a gig
// shorter than includedHours isn't negative overtime).
export function getOvertimeHours(booking, contractor) {
  const tier = getPricingTier(contractor, booking?.pricingTierId);
  if (!tierHasOvertime(tier)) return 0;
  if (booking.overtimeHoursOverride !== null && booking.overtimeHoursOverride !== undefined && booking.overtimeHoursOverride !== '') {
    return Math.max(0, Number(booking.overtimeHoursOverride) || 0);
  }
  const actualHours = computeDurationHours(booking.startTime, booking.endTime);
  if (actualHours === null) return 0;
  return Math.max(0, actualHours - Number(tier.includedHours));
}

export function getOvertimeAmount(booking, contractor) {
  const tier = getPricingTier(contractor, booking?.pricingTierId);
  return getOvertimeHours(booking, contractor) * (Number(tier?.overtimeRate) || 0);
}

// Base tier price plus whatever overtime applies — the one function
// anything computing a contractor's real cost for a gig should call,
// rather than getTierPrice alone.
export function getBookingTotal(booking, contractor) {
  return getTierPrice(contractor, booking?.pricingTierId) + getOvertimeAmount(booking, contractor);
}
