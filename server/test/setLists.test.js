import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSetListBody } from '../src/routes/setListLibrary.js';
import { validateEventSetLists } from '../src/routes/events.js';
import { setListRecipientGroups } from '../../src/lib/setListRecipients.js';

const song = (patch = {}) => ({ id: 'song-1', songTitle: 'First Dance', description: '', link: '', documentId: null, ...patch });

test('library validation rejects duplicate song ids and unsafe links', () => {
  assert.match(validateSetListBody({ name: 'Reception', items: [song(), song()] }), /valid song list/);
  assert.match(validateSetListBody({ name: 'Reception', items: [song({ link: 'javascript:alert(1)' })] }), /valid song list/);
  assert.equal(validateSetListBody({ name: 'Reception', items: [song({ link: 'https://example.com/music' })], eventIds: [] }), null);
});

test('event validation bounds list size and accepts normal set lists', () => {
  assert.equal(validateEventSetLists([{ id: 'set-1', name: 'Reception', items: [song()] }]), null);
  assert.match(validateEventSetLists(Array.from({ length: 26 }, (_, index) => ({ id: `set-${index}`, name: 'Set', items: [] }))), /25/);
  assert.match(validateEventSetLists([{ id: 'set-1', name: 'Reception', items: [song(), song()] }]), /unique valid id/);
});

test('recipient grouping defaults to confirmed and excludes unavailable contractors', () => {
  const contractors = [
    { id: 'c1', firstName: 'Confirmed', email: 'confirmed@example.com' },
    { id: 'c2', firstName: 'Tentative', email: 'tentative@example.com' },
    { id: 'c3', firstName: 'Declined', email: 'declined@example.com' },
    { id: 'c4', firstName: 'No Email', email: '' },
  ];
  const event = { contractorBookings: [
    { contractorId: 'c1', inquiryStatusId: 'confirmed' },
    { contractorId: 'c2', inquiryStatusId: 'tentative' },
    { contractorId: 'c3', inquiryStatusId: 'unavailable' },
    { contractorId: 'c4', inquiryStatusId: 'confirmed' },
  ] };
  const statuses = [
    { id: 'confirmed', bucket: 'confirmed', isConfirmed: true },
    { id: 'tentative', bucket: 'tentative', isConfirmed: false },
    { id: 'unavailable', bucket: 'unavailable', isConfirmed: false },
  ];
  const groups = setListRecipientGroups(event, contractors, statuses);
  assert.deepEqual(groups.confirmed.map((item) => item.id), ['c1']);
  assert.deepEqual(groups.tentative.map((item) => item.id), ['c2']);
  assert.equal(groups.unavailableCount, 1);
  assert.equal(groups.missingEmailCount, 1);
});
