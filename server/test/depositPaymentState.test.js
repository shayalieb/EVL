import test from 'node:test';
import assert from 'node:assert/strict';
import { depositPaymentState } from '../../src/lib/depositPaymentState.js';

test('paid invoices satisfy the booking deposit without a duplicate manual action', () => {
  assert.deepEqual(depositPaymentState({
    amount: 867.5,
    bookingPaid: false,
    invoices: [{ status: 'paid', paidAmount: 867.5 }, { status: 'paid', paidAmount: 7807.5 }],
  }), { paid: true, paidViaInvoices: true, collectedFromInvoices: 8675 });
});

test('partial collections below the deposit remain outstanding', () => {
  assert.deepEqual(depositPaymentState({
    amount: 1000,
    bookingPaid: false,
    invoices: [{ status: 'partial', paidAmount: 400 }, { status: 'void', paidAmount: 1000 }],
  }), { paid: false, paidViaInvoices: false, collectedFromInvoices: 400 });
});

test('legacy manual deposit status remains authoritative without invoices', () => {
  assert.equal(depositPaymentState({ amount: 500, bookingPaid: true }).paid, true);
});
