import test from 'node:test';
import assert from 'node:assert/strict';
import { contractorCalendarPaymentInfo } from '../src/lib/contractorCalendarPayment.js';

test('contractor calendar exposes complete paid details without internal memos', () => {
  const payment = contractorCalendarPaymentInfo({
    paymentStatus: 'paid', paidAmount: 825, paidAt: '2026-08-30', paymentMethod: 'check', paymentReference: '1042', paymentMemo: 'Internal note',
  }, 800, { effectiveDueDate: '2026-08-29', dueDateIsDefault: false });
  assert.deepEqual(payment, {
    paymentStatus: 'paid', expectedAmount: 800, paymentDueDate: '2026-08-29', paymentDueDateIsDefault: false,
    paidAmount: 825, paidAt: '2026-08-30', paymentMethod: 'check', paymentReference: '1042',
  });
  assert.equal('paymentMemo' in payment, false);
});

test('contractor calendar shows expected unpaid details but no paid fields', () => {
  assert.deepEqual(contractorCalendarPaymentInfo({ paymentStatus: 'unpaid' }, 700, { effectiveDueDate: '2026-09-15', dueDateIsDefault: true }), {
    paymentStatus: 'unpaid', expectedAmount: 700, paymentDueDate: '2026-09-15', paymentDueDateIsDefault: true,
    paidAmount: null, paidAt: null, paymentMethod: null, paymentReference: null,
  });
});
