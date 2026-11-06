import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeClientMoney, buildClientTimeline } from '../src/lib/clientOverview.js';

const item = (amount) => ({ type: 'package', amount });
const invoice = (over) => ({ status: 'sent', snapshot: { lineItems: [item(1000)] }, paidAmount: 0, displayNumber: 100001, bookingId: 'b1', ...over });

test('money ignores drafts and voids, and caps paid at the total', () => {
  const past = new Date(Date.now() - 86_400_000);
  const m = summarizeClientMoney([
    invoice({ status: 'paid', paidAmount: 1000 }),
    invoice({ status: 'partial', paidAmount: 400, dueDate: past }),
    invoice({ status: 'draft' }),
    invoice({ status: 'void' }),
    invoice({ status: 'sent', paidAmount: 5000 }),
  ]);
  assert.deepEqual(m, { billed: 3000, paid: 2400, outstanding: 600, overdue: 600 });
});

test('timeline merges sources newest first, skips missing dates, and truncates long notes', () => {
  const t = buildClientTimeline({
    client: { createdAt: '2026-01-01T00:00:00Z' },
    bookings: [{ id: 'b1', eventName: 'Gala', createdAt: '2026-01-02T00:00:00Z', proposal: { sentAt: '2026-01-03T00:00:00Z' } }],
    contracts: [{ bookingId: 'b1', displayNumber: 100002, createdAt: '2026-01-04T00:00:00Z', clientSignedAt: '2026-01-05T00:00:00Z', ownerSignedAt: null }],
    invoices: [invoice({ sentAt: '2026-01-06T00:00:00Z', paidAt: '2026-01-07T00:00:00Z', paidAmount: 1000, status: 'paid' })],
    messages: [{ direction: 'inbound', subject: 'Question', createdAt: '2026-01-08T00:00:00Z' }],
    notes: [{ type: 'call', authorName: 'Sam', body: 'x'.repeat(300), createdAt: '2026-01-09T00:00:00Z' }],
  });
  assert.deepEqual(t.map((e) => e.kind), ['note', 'email', 'payment', 'invoice', 'contract', 'contract', 'proposal', 'booking', 'client']);
  assert.equal(t[0].title, 'Call note by Sam');
  assert.ok(t[0].detail.length <= 160);
  assert.equal(t[2].detail, '$1000.00');
  assert.equal(t.at(-1).title, 'Client added');
});
