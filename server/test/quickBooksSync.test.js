import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentSyncEligibility, quickBooksCustomerCandidate, quickBooksCustomerPayload, quickBooksInvoicePayload, quickBooksPaymentPayload } from '../src/lib/quickBooksSync.js';

test('customer matching prioritizes exact email over name similarity', () => {
  const client = { firstName: 'Sam', lastName: 'Music', email: 'sam@example.com', phone: '212-555-0100' };
  const exact = quickBooksCustomerCandidate(client, { Id: '1', DisplayName: 'Different Name', PrimaryEmailAddr: { Address: 'SAM@example.com' } });
  const similar = quickBooksCustomerCandidate(client, { Id: '2', DisplayName: 'Sam Music Company' });
  assert.equal(exact.score, 100);
  assert.equal(similar.score, 60);
});

test('customer export includes operational contact and billing address', () => {
  const payload = quickBooksCustomerPayload({ firstName: 'Sam', lastName: 'Music', email: 'sam@example.com', phone: '2125550100', address1: '1 Main St', city: 'New York', state: 'NY', zip: '10001' });
  assert.equal(payload.DisplayName, 'Sam Music');
  assert.equal(payload.PrimaryEmailAddr.Address, 'sam@example.com');
  assert.equal(payload.BillAddr.PostalCode, '10001');
});

test('invoice export preserves item totals and agency class tracking', () => {
  const invoice = { number: 42, createdAt: '2026-09-01T12:00:00Z', dueDate: '2026-09-15T12:00:00Z', snapshot: { lineItems: [{ name: 'Band', type: 'perUnit', unitCount: 2, ratePerUnit: 500 }, { name: 'Production', amount: 250 }] } };
  const payload = quickBooksInvoicePayload({ invoice, customerId: '9', serviceItemId: '7', booking: { eventName: 'Fall Gala' }, groupReference: { type: 'class', id: '3' } });
  assert.equal(payload.DocNumber, '42');
  assert.equal(payload.Line.reduce((sum, line) => sum + line.Amount, 0), 1250);
  assert.equal(payload.Line[0].SalesItemLineDetail.ClassRef.value, '3');
  assert.equal(payload.CustomerMemo.value, 'Fall Gala');
});

test('partial client payments link to the exported QuickBooks invoice', () => {
  const transaction = { amountCents: 25050, occurredAt: '2026-09-04T12:00:00Z', category: 'client_payment', invoiceId: 'invoice-1', reference: 'Check 42', description: 'Deposit' };
  assert.equal(paymentSyncEligibility(transaction).eligible, true);
  const payload = quickBooksPaymentPayload({ transaction, customerId: '8', quickBooksInvoiceId: '9' });
  assert.equal(payload.TotalAmt, 250.5);
  assert.equal(payload.Line[0].LinkedTxn[0].TxnId, '9');
  assert.equal(payload.PaymentRefNum, 'Check 42');
});

test('corrections and reversals require deliberate manual reconciliation', () => {
  assert.equal(paymentSyncEligibility({ invoiceId: 'i', category: 'payment_adjustment', amountCents: -100 }).eligible, false);
  assert.equal(paymentSyncEligibility({ invoiceId: 'i', category: 'reversal', amountCents: -100, reversalOfId: 'old' }).eligible, false);
});
