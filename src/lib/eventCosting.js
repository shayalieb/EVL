import { getPricingTier } from './pricingTiers';
import { statusBucket } from './inquiryStatusBucket';

export function eventCostingStatus(event, contractors = [], inquiryStatuses = []) {
  const activeBookings = (event?.contractorBookings || []).filter((booking) => {
    const status = inquiryStatuses.find((item) => item.id === booking.inquiryStatusId);
    return statusBucket(status) !== 'unavailable';
  });
  if (activeBookings.length === 0 && event?.noOutsideContractorsNeeded) {
    return { complete: true, reason: 'No outside contractors needed' };
  }
  if (activeBookings.length === 0) return { complete: false, reason: 'No contractor plan' };

  const missingRate = activeBookings.some((booking) => {
    const contractor = contractors.find((item) => item.id === booking.contractorId);
    return !contractor || !getPricingTier(contractor, booking.pricingTierId);
  });
  if (missingRate) return { complete: false, reason: 'Contractor rate missing' };
  return { complete: true, reason: 'Contractor costs entered' };
}
