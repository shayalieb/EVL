import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutSessionMatchesInvoice, paidCheckoutSessionMatchesInvoice } from '../src/lib/invoicePaymentVerification.js';

const invoice = { id: 'invoice-1', stripeCheckoutSessionId: 'cs_expected' };

test('checkout verification requires both the stored session and invoice metadata', () => {
  assert.equal(checkoutSessionMatchesInvoice({ id: 'cs_expected', metadata: { invoiceId: 'invoice-1' } }, invoice), true);
  assert.equal(checkoutSessionMatchesInvoice({ id: 'cs_other', metadata: { invoiceId: 'invoice-1' } }, invoice), false);
  assert.equal(checkoutSessionMatchesInvoice({ id: 'cs_expected', metadata: { invoiceId: 'invoice-2' } }, invoice), false);
});

test('paid checkout verification also requires Stripe payment confirmation', () => {
  assert.equal(paidCheckoutSessionMatchesInvoice({ id: 'cs_expected', metadata: { invoiceId: 'invoice-1' }, payment_status: 'paid' }, invoice), true);
  assert.equal(paidCheckoutSessionMatchesInvoice({ id: 'cs_expected', metadata: { invoiceId: 'invoice-1' }, payment_status: 'unpaid' }, invoice), false);
});
