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
