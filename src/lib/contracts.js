import { apiFetch } from '../context/AuthContext';

export async function getContractForBooking(bookingId) {
  const data = await apiFetch(`/contracts?bookingId=${encodeURIComponent(bookingId)}`);
  return data.contract;
}

export async function sendContract({ bookingId, recipientEmail, recipientName, snapshot }) {
  return apiFetch('/contracts', {
    method: 'POST',
    body: JSON.stringify({ bookingId, recipientEmail, recipientName, snapshot }),
  });
}

export async function ownerSignContract(contractId, { signatureName, signatureImage }) {
  const data = await apiFetch(`/contracts/${contractId}/owner-sign`, {
    method: 'POST',
    body: JSON.stringify({ signatureName, signatureImage }),
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
