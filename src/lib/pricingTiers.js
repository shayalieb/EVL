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
