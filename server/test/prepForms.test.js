import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrepFormSubmission, preserveClientPrepRequests } from '../src/lib/prepForms.js';

test('prep form accepts bounded request rows and notes', () => {
  const result = normalizePrepFormSubmission({ submitterName: '  Client  ', items: [{ name: 'First dance', details: 'Use the live version', link: 'https://example.com/song' }], notes: 'Please call me.' });
  assert.equal(result.submitterName, 'Client');
  assert.equal(result.items[0].name, 'First dance');
  assert.equal(result.notes, 'Please call me.');
});

test('prep form rejects an unsafe reference link', () => {
  assert.equal(normalizePrepFormSubmission({ submitterName: 'Client', items: [{ name: 'Song', link: 'javascript:alert(1)' }] }).error, 'Reference links must begin with http:// or https://.');
});

test('event autosaves preserve client-submitted prep rows', () => {
  const clientRow = { id: 'client-1', name: 'Entrance song', source: 'client_prep_form' };
  const merged = preserveClientPrepRequests([{ id: 'manual-1', name: 'Load in' }], [clientRow]);
  assert.deepEqual(merged.map((item) => item.id), ['manual-1', 'client-1']);
});
