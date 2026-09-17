import test from 'node:test';
import assert from 'node:assert/strict';
import { hasContractorConfirmationButton, renderContractorConfirmationButton } from '../src/lib/contractorConfirmationButton.js';

test('contractor confirmation placeholder becomes the supplied email button', () => {
  const body = '<p>Please respond.</p>{{ContractorConfirmationButton}}';
  assert.equal(hasContractorConfirmationButton(body), true);
  assert.equal(renderContractorConfirmationButton(body, '<a href="/gigs/token">Confirm</a>'), '<p>Please respond.</p><a href="/gigs/token">Confirm</a>');
});

test('unavailable confirmation actions remove the placeholder instead of exposing template syntax', () => {
  assert.equal(renderContractorConfirmationButton('Hello {{ContractorConfirmationButton}}'), 'Hello ');
  assert.equal(hasContractorConfirmationButton('Hello contractor'), false);
});
