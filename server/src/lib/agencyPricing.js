export function normalizeAgencyGroupCount(value, includedGroupCount = 2) {
  return Math.min(500, Math.max(includedGroupCount, Number.parseInt(value, 10) || includedGroupCount));
}

export function agencyAmountCents(tier, interval, groupCount) {
  const included = Math.max(2, Number(tier.includedGroupCount) || 2);
  const count = normalizeAgencyGroupCount(groupCount, included);
  const extra = count - included;
  return interval === 'year'
    ? Number(tier.annualAmountCents) + extra * Number(tier.annualAdditionalGroupCents)
    : Number(tier.monthlyAmountCents) + extra * Number(tier.monthlyAdditionalGroupCents);
}
