import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentHash, buildFinalRecord, stableStringify } from '../src/lib/contractEvidence.js';

test('contract document hashes are deterministic across object key order', () => {
  const first = buildDocumentHash({ snapshot: { b: 2, a: 1 }, terms: 'Terms', documentType: 'contract', revisionNumber: 1 });
  const second = buildDocumentHash({ snapshot: { a: 1, b: 2 }, terms: 'Terms', documentType: 'contract', revisionNumber: 1 });
  assert.equal(first, second);
  assert.notEqual(first, buildDocumentHash({ snapshot: { a: 1, b: 3 }, terms: 'Terms', documentType: 'contract', revisionNumber: 1 }));
});

test('completed record binds both signatures and consent evidence', () => {
  const contract = {
    id: 'contract-1', documentType: 'addendum', revisionNumber: 2, previousContractId: 'contract-0', documentHash: 'document-hash',
    snapshot: { title: 'Addendum' }, terms: 'Only this term changes.', recipientEmail: 'client@example.com', ownerEmail: 'owner@example.com',
    clientSignatureName: 'Client Person', clientSignatureImage: 'data:image/png;base64,client', clientSignedAt: new Date('2026-09-18T12:00:00Z'), clientConsentVersion: 'v1', clientSignedIp: '192.0.2.1', clientSignedUserAgent: 'Browser A',
    ownerSignatureName: 'Owner Person', ownerSignatureImage: 'data:image/png;base64,owner', ownerSignedAt: new Date('2026-09-18T12:05:00Z'), ownerConsentVersion: 'v1', ownerSignedIp: '192.0.2.2', ownerSignedUserAgent: 'Browser B',
  };
  const completed = buildFinalRecord(contract);
  assert.equal(completed.record.clientSignature.consentVersion, 'v1');
  assert.equal(completed.record.ownerSignature.name, 'Owner Person');
  assert.equal(completed.hash.length, 64);
  assert.equal(stableStringify(completed.record), stableStringify({ ...completed.record }));
});
