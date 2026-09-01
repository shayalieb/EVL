import { apiFetch } from '../context/AuthContext';

export async function getContractForBooking(bookingId) {
  const data = await apiFetch(`/contracts?bookingId=${encodeURIComponent(bookingId)}`);
  return data.contract;
}

// Every contract on the account (see BookingsPage.jsx's Stage column, which
// needs each booking's contract status without a fetch per row).
export async function listContracts() {
  const data = await apiFetch('/contracts');
  return data.contracts;
}

// `manual`+`reason`: skips the actual outbound email and logs a
// 'manual_sent' entry with the reason instead of 'sent' — for contracts
// delivered outside GigWorks (printed, texted, signed in person, etc.).
export async function sendContract({ bookingId, recipientEmail, recipientName, snapshot, terms, manual, reason, expiration }) {
  return apiFetch('/contracts', {
    method: 'POST',
    body: JSON.stringify({ bookingId, recipientEmail, recipientName, snapshot, terms, manual, reason, expiration }),
  });
}

// Manual free-text log entry — same idea as a booking's Activity Log, but
// this one is persisted server-side since Contract has no client-editable
// blob (see Contract.log in the Prisma schema).
export async function addContractLogNote(contractId, note) {
  const data = await apiFetch(`/contracts/${contractId}/log`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
  return data.contract;
}

// Issues a fresh client sign link, invalidating whatever the old one was —
// use when the original link was lost (never emailed, e.g. a manually-sent
// contract) or the client needs a new one for any other reason.
export async function regenerateClientSignLink(contractId, expiration) {
  return apiFetch(`/contracts/${contractId}/regenerate-client-link`, { method: 'POST', body: JSON.stringify({ expiration }) });
}

export async function ownerSignContract(contractId, { signatureName, signatureImage }) {
  const data = await apiFetch(`/contracts/${contractId}/owner-sign`, {
    method: 'POST',
    body: JSON.stringify({ signatureName, signatureImage }),
  });
  return data.contract;
}

// Editable at any point in the contract's lifecycle, independent of status.
export async function updateContractTerms(contractId, terms) {
  const data = await apiFetch(`/contracts/${contractId}/terms`, {
    method: 'PATCH',
    body: JSON.stringify({ terms }),
  });
  return data.contract;
}

// ---- Public (unauthenticated, token-based — used by ContractSignPage) ----

export async function getContractByToken(token) {
  const data = await apiFetch(`/contract-sign/${encodeURIComponent(token)}`);
  return data.contract;
}

export async function viewContractByToken(token, email) {
  const data = await apiFetch(`/contract-sign/${encodeURIComponent(token)}/view`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return data.contract;
}

export async function submitContractSignature(token, { email, signatureName, signatureImage }) {
  const data = await apiFetch(`/contract-sign/${encodeURIComponent(token)}/submit`, {
    method: 'POST',
    body: JSON.stringify({ email, signatureName, signatureImage }),
  });
  return data.contract;
}
