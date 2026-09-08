import { apiFetch } from '../context/AuthContext';

// The current account's NDA/non-compete rows — only meaningful while
// agreementsRequired && !agreementsSigned (see AuthContext.jsx's currentUser
// shape). Reachable even in that blocked state (see server-side
// attachMembershipForBilling reuse in designPartnerAgreements.js).
export async function getMyAgreements() {
  const data = await apiFetch('/agreements');
  return data.agreements;
}

// One signature stamps every still-unsigned agreement on the account.
export async function signAgreements({ signatureName, signatureImage }) {
  const data = await apiFetch('/agreements/sign', {
    method: 'POST',
    body: JSON.stringify({ signatureName, signatureImage }),
  });
  return data.agreements;
}
