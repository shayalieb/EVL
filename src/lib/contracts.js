import { apiFetch } from '../context/AuthContext';

export async function getContractForBooking(bookingId) {
  const data = await apiFetch(`/contracts?bookingId=${encodeURIComponent(bookingId)}`);
  return data.contract;
}

export async function sendContract({ bookingId, recipientEmail, recipientName, snapshot, terms }) {
  return apiFetch('/contracts', {
    method: 'POST',
    body: JSON.stringify({ bookingId, recipientEmail, recipientName, snapshot, terms }),
  });
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
