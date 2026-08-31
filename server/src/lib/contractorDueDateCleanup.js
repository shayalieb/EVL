import { plausibleIsoDate } from './financialReports.js';

export function cleanContractorDueDates(contractorBookings) {
  if (!Array.isArray(contractorBookings)) return { contractorBookings, removedCount: 0 };
  let removedCount = 0;
  const cleaned = contractorBookings.map((booking) => {
    if (!booking || typeof booking !== 'object' || Array.isArray(booking)) return booking;
    if (!booking.paymentDueDate || plausibleIsoDate(booking.paymentDueDate)) return booking;
    removedCount += 1;
    return { ...booking, paymentDueDate: null };
  });
  return { contractorBookings: removedCount ? cleaned : contractorBookings, removedCount };
}
