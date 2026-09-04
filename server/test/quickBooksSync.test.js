import test from 'node:test';
import assert from 'node:assert/strict';
import { contractorBillEligibility, contractorBillLocalId, contractorPaymentSyncEligibility, paymentSyncEligibility, quickBooksBillPaymentPayload, quickBooksBillPayload, quickBooksCustomerCandidate, quickBooksCustomerPayload, quickBooksInvoicePayload, quickBooksPaymentPayload, quickBooksVendorCandidate, quickBooksVendorPayload } from '../src/lib/quickBooksSync.js';

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

test('vendor matching prioritizes contractor email and preserves contact details', () => {
  const contractor = { firstName: 'Jamie', middleName: 'R', lastName: 'Keys', email: 'jamie@example.com', phone: '646-555-0100' };
  const candidate = quickBooksVendorCandidate(contractor, { Id: '12', DisplayName: 'Jamie Music', PrimaryEmailAddr: { Address: 'JAMIE@example.com' } });
  const payload = quickBooksVendorPayload(contractor);
  assert.equal(candidate.score, 100);
  assert.equal(payload.DisplayName, 'Jamie Keys');
  assert.equal(payload.MiddleName, 'R');
  assert.equal(payload.PrimaryPhone.FreeFormNumber, '646-555-0100');
});

test('contractor bills require confirmation and a positive rate', () => {
  const assignment = { id: 'assignment-1', contractorId: 'contractor-1' };
  assert.equal(contractorBillEligibility({ assignment, inquiryStatus: { isConfirmed: true }, amount: 500 }).eligible, true);
  assert.equal(contractorBillEligibility({ assignment, inquiryStatus: { label: 'Tentative' }, amount: 500 }).eligible, false);
  assert.equal(contractorBillEligibility({ assignment, inquiryStatus: { isConfirmed: true }, amount: 0 }).eligible, false);
  assert.equal(contractorBillLocalId('event-1', assignment), 'event-1:assignment-1');
});

test('contractor bill carries the gig, payable account, and agency tracking', () => {
  const payload = quickBooksBillPayload({ event: { id: 'e1', name: 'Fall Gala', eventDate: '2026-10-01' }, assignment: { startTime: '18:00', endTime: '22:00', paymentDueDate: '2026-10-02' }, contractor: { firstName: 'Jamie', lastName: 'Keys' }, vendorId: '4', expenseAccountId: '5', accountsPayableId: '6', amount: 750, groupReference: { type: 'class', id: '7' } });
  assert.equal(payload.VendorRef.value, '4');
  assert.equal(payload.APAccountRef.value, '6');
  assert.equal(payload.Line[0].Amount, 750);
  assert.match(payload.Line[0].Description, /Fall Gala/);
  assert.equal(payload.Line[0].AccountBasedExpenseLineDetail.ClassRef.value, '7');
});

test('contractor payments require an assignment and create a linked bill payment', () => {
  const transaction = { category: 'contractor_payment', amountCents: -72500, eventId: 'e1', contractorId: 'c1', occurredAt: '2026-10-02', reference: 'ACH-42', metadata: { contractorBookingId: 'a1' } };
  assert.equal(contractorPaymentSyncEligibility(transaction).eligible, true);
  const payload = quickBooksBillPaymentPayload({ transaction, vendorId: '2', quickBooksBillId: '3', paymentAccountId: '4', paymentAccountType: 'Bank' });
  assert.equal(payload.PayType, 'Check');
  assert.equal(payload.TotalAmt, 725);
  assert.equal(payload.Line[0].LinkedTxn[0].TxnId, '3');
  assert.equal(payload.CheckPayment.BankAccountRef.value, '4');
});

test('contractor payment corrections stay in manual review', () => {
  assert.equal(contractorPaymentSyncEligibility({ category: 'payment_adjustment', amountCents: 100, eventId: 'e1', contractorId: 'c1', metadata: { contractorBookingId: 'a1' } }).eligible, false);
});
