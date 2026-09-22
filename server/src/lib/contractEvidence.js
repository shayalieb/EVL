import { createHash } from 'node:crypto';

export const ESIGN_CONSENT_VERSION = '2026-09-18-v1';
export const ESIGN_CONSENT_TEXT = 'I have reviewed this contract version, intend to sign it, consent to use electronic records and signatures for this transaction, and can access or download a copy. I understand I may request a paper copy from the sender.';

export function stableStringify(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

export function buildDocumentHash({ snapshot, terms, documentType, revisionNumber, previousContractId }) {
  return sha256({ snapshot, terms: terms || null, documentType, revisionNumber, previousContractId: previousContractId || null });
}

export function buildFinalRecord(contract) {
  const record = {
    recordVersion: '2026-09-18-v1',
    contractId: contract.id,
    documentNumber: contract.documentNumber,
    rootContractId: contract.rootContractId,
    documentType: contract.documentType,
    revisionNumber: contract.revisionNumber,
    previousContractId: contract.previousContractId,
    documentHash: contract.documentHash,
    snapshot: contract.snapshot,
    terms: contract.terms,
    recipientEmail: contract.recipientEmail,
    ownerEmail: contract.ownerEmail,
    completedAt: contract.completedAt,
    clientSignature: {
      name: contract.clientSignatureName,
      image: contract.clientSignatureImage,
      signedAt: contract.clientSignedAt,
      consentVersion: contract.clientConsentVersion,
      consentText: ESIGN_CONSENT_TEXT,
      ip: contract.clientSignedIp,
      userAgent: contract.clientSignedUserAgent,
    },
    ownerSignature: {
      name: contract.ownerSignatureName,
      image: contract.ownerSignatureImage,
      signedAt: contract.ownerSignedAt,
      consentVersion: contract.ownerConsentVersion,
      consentText: ESIGN_CONSENT_TEXT,
      ip: contract.ownerSignedIp,
      userAgent: contract.ownerSignedUserAgent,
    },
  };
  return { record, hash: sha256(record) };
}

export function requestEvidence(req) {
  return {
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: String(req.get('user-agent') || '').slice(0, 2000) || null,
  };
}
