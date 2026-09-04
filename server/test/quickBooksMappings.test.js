import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuickBooksReference, quickBooksSetupReadiness, suggestedQuickBooksMappings, validateQuickBooksMappings } from '../src/lib/quickBooksMappings.js';

const accounts = [
  { id: 'income', name: 'Service Income', type: 'Income', active: true },
  { id: 'contractors', name: 'Contract Labor', type: 'Cost of Goods Sold', active: true },
  { id: 'expenses', name: 'General Expenses', type: 'Expense', active: true },
  { id: 'ar', name: 'Accounts Receivable', type: 'Accounts Receivable', active: true },
  { id: 'ap', name: 'Accounts Payable', type: 'Accounts Payable', active: true },
];
const items = [{ id: 'service', name: 'Services', type: 'Service', active: true }];

test('normalizes only the QuickBooks reference fields GigWorks needs', () => {
  assert.deepEqual(normalizeQuickBooksReference({ Id: '7', Name: 'Travel', FullyQualifiedName: 'Gig Costs:Travel', AccountType: 'Expense', AccountSubType: 'Travel', Active: true }), { id: '7', name: 'Travel', fullyQualifiedName: 'Gig Costs:Travel', type: 'Expense', subtype: 'Travel', active: true });
});

test('suggests compatible accounts without pretending setup was approved', () => {
  const suggested = suggestedQuickBooksMappings(accounts, items);
  assert.equal(suggested.incomeAccountId, 'income');
  assert.equal(suggested.contractorExpenseAccountId, 'contractors');
  assert.equal(suggested.accountsReceivableId, 'ar');
  assert.equal(suggested.serviceItemId, 'service');
});

test('validates required mappings and fills category defaults', () => {
  const suggested = suggestedQuickBooksMappings(accounts, items);
  const result = validateQuickBooksMappings(suggested, accounts, [], [], [], items);
  assert.deepEqual(result.errors, []);
  assert.equal(result.mappings.categoryMappings.contractor_payment, 'contractors');
  assert.equal(result.mappings.categoryMappings.travel, 'expenses');
});

test('agency tracking requires every active group to have a valid mapping', () => {
  const suggested = { ...suggestedQuickBooksMappings(accounts, items), agencyTrackingMode: 'class', groupMappings: { group1: 'class1' } };
  const groups = [{ id: 'group1', name: 'Band One' }, { id: 'group2', name: 'Band Two' }];
  const result = validateQuickBooksMappings(suggested, accounts, [{ id: 'class1', name: 'Band One' }], [], groups, items);
  assert.ok(result.errors.some((error) => error.includes('Band Two')));
});

test('readiness requires an explicit save after importing accounts', () => {
  const connection = { status: 'active', accountsSnapshot: accounts, classesSnapshot: [], locationsSnapshot: [], itemsSnapshot: items, accountingMappings: suggestedQuickBooksMappings(accounts, items), referenceDataRefreshedAt: new Date(), setupCompletedAt: null };
  assert.equal(quickBooksSetupReadiness(connection).ready, false);
  assert.equal(quickBooksSetupReadiness({ ...connection, setupCompletedAt: new Date() }).ready, true);
});
