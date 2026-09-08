import { isValidEmailAddress } from './format.js';
import { statusBucket } from './inquiryStatusBucket.js';

// A set list is performance material. Confirmed performers are the safe
// default; tentative performers remain available as an explicit choice, and
// unavailable/declined people are never offered as recipients.
export function setListRecipientGroups(event, contractors, inquiryStatuses = []) {
  const statusById = new Map(inquiryStatuses.map((status) => [status.id, status]));
  const groups = { confirmed: [], tentative: [], unavailableCount: 0, missingEmailCount: 0 };
  const seen = new Set();
  for (const assignment of event?.contractorBookings || []) {
    if (!assignment?.contractorId || seen.has(assignment.contractorId)) continue;
    seen.add(assignment.contractorId);
    const contractor = contractors.find((item) => item.id === assignment.contractorId);
    if (!contractor) continue;
    const bucket = statusBucket(statusById.get(assignment.inquiryStatusId));
    if (bucket === 'unavailable') { groups.unavailableCount += 1; continue; }
    if (!isValidEmailAddress(contractor.email)) { groups.missingEmailCount += 1; continue; }
    if (bucket === 'confirmed') groups.confirmed.push(contractor);
    else groups.tentative.push(contractor);
  }
  return groups;
}
