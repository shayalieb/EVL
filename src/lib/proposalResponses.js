import { apiFetch } from '../context/AuthContext';

export async function getProposalResponseForBooking(bookingId) {
  const data = await apiFetch(`/proposal-responses?bookingId=${encodeURIComponent(bookingId)}`);
  return data.proposalResponse;
}

// Every proposal response on the account (see BookingsPage.jsx, which needs
// each booking's response status — specifically revision requests — without
// a fetch per row), same shape as listContracts().
export async function listProposalResponses() {
  const data = await apiFetch('/proposal-responses');
  return data.proposalResponses;
}

// `manual`+`reason`: skips creating a respond link email and logs a
// 'manual_sent' entry with the reason instead of 'sent' — for proposals
// delivered outside GigWorks. The link is still generated either way, same
// as sendContract, in case it's useful to share by hand.
export async function sendProposalResponseLink({ bookingId, recipientEmail, recipientName, snapshot, manual, reason, expiration }) {
  return apiFetch('/proposal-responses', {
    method: 'POST',
    body: JSON.stringify({ bookingId, recipientEmail, recipientName, snapshot, manual, reason, expiration }),
  });
}

// ---- Public (unauthenticated, token-based — used by ProposalRespondPage) ----

export async function getProposalResponseByToken(token) {
  const data = await apiFetch(`/proposal-respond/${encodeURIComponent(token)}`);
  return data.proposalResponse;
}

export async function submitProposalResponse(token, { action, note }) {
  const data = await apiFetch(`/proposal-respond/${encodeURIComponent(token)}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action, note }),
  });
  return data.proposalResponse;
}
