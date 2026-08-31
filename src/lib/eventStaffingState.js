import { statusBucket } from './inquiryStatusBucket.js';

export function activeContractorBookingCount(bookings = [], inquiryStatuses = []) {
  const statusById = new Map(inquiryStatuses.map((status) => [status.id, status]));
  return bookings.filter((booking) => statusBucket(statusById.get(booking.inquiryStatusId)) !== 'unavailable').length;
}

export function normalizeNoOutsideContractorsNeeded(value, bookings = [], inquiryStatuses = []) {
  return activeContractorBookingCount(bookings, inquiryStatuses) > 0 ? false : Boolean(value);
}
