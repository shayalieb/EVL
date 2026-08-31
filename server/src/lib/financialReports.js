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

export function bookingProfitabilitySnapshot({ billed, event, assignments = [], contractorById = new Map() }) {
  const otherCosts = (event?.otherExpenses || []).reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
  let missingCostCount = 0;
  const contractorCosts = assignments.reduce((sum, assignment) => {
    const cost = contractorAssignmentCost(assignment, contractorById.get(assignment.contractorId));
    if (cost === null) { missingCostCount += 1; return sum; }
    return sum + cost;
  }, 0);
  const estimatedCosts = otherCosts + contractorCosts;
  const costsComplete = !!event && ((assignments.length === 0 && event.noOutsideContractorsNeeded) || (assignments.length > 0 && missingCostCount === 0));
  return {
    estimatedCosts,
    costsComplete,
    missingCostCount,
    estimatedProfit: costsComplete ? billed - estimatedCosts : null,
    margin: costsComplete && billed > 0 ? ((billed - estimatedCosts) / billed) * 100 : null,
  };
}

// A contractor payment with no explicit due date defaults to "due by the
// event date" instead of showing as perpetually missing — every gig has a
// date already, so there's no reason a payment due date should start blank.
// effectiveDueDate/dueDateIsDefault let the client show what date is
// actually in effect and make clear when it's a default versus something
// someone explicitly chose.
export function plausibleIsoDate(value) {
  if (typeof value !== 'string' || !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function contractorPaymentTiming({ dueDate, eventDate, today = new Date().toISOString().slice(0, 10) } = {}) {
  const safeDueDate = plausibleIsoDate(dueDate);
  const safeEventDate = plausibleIsoDate(eventDate);
  const effectiveDueDate = safeDueDate || safeEventDate;
  const dueDateIsDefault = !safeDueDate && !!safeEventDate;
  if (!effectiveDueDate) return { status: 'missing', label: 'No due date set', overdueDays: 0, effectiveDueDate: null, dueDateIsDefault: false };
  if (effectiveDueDate < today) {
    const overdueDays = dateDaysBetween(new Date(`${today}T12:00:00.000Z`), new Date(`${effectiveDueDate}T12:00:00.000Z`));
    return { status: 'overdue', label: `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue`, overdueDays, effectiveDueDate, dueDateIsDefault };
  }
  if (effectiveDueDate === today) return { status: 'due', label: 'Due today', overdueDays: 0, effectiveDueDate, dueDateIsDefault };
  return { status: 'upcoming', label: 'Upcoming', overdueDays: 0, effectiveDueDate, dueDateIsDefault };
}

export function inIsoDateRange(value, from, to) {
  if (!value) return !from && !to;
  return (!from || value >= from) && (!to || value <= to);
}
