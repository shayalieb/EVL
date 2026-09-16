import test from 'node:test';
import assert from 'node:assert/strict';
import { mapVenuePlace, lookupVenue } from '../src/lib/venueLookup.js';
import { fillEmptyVenueFields } from '../../src/lib/venueLookup.js';

test('venue lookup maps address and contact details without invented values', () => {
  const place = mapVenuePlace({ name: 'Hall', housenumber: '12', street: 'Main St', state_code: 'NY', contact: { phone: '555-1234' } });
  assert.equal(place.address1, '12 Main St');
  assert.equal(place.contactPhone, '555-1234');
  assert.equal(place.contactEmail, '');
  assert.equal(mapVenuePlace({ name: 'Hall', address_line1: 'Hall' }).address1, '');
});
test('autofill preserves existing values and leaves unavailable fields empty', () => {
  const current = { name: 'My venue', contactPhone: 'Existing', contactEmail: '', loadInInfo: 'Rear door', address1: '' };
  const next = fillEmptyVenueFields(current, { name: 'Other', contactPhone: 'New', address1: '12 Main St' });
  assert.deepEqual(next, { ...current, address1: '12 Main St' });
  assert.equal(current.address1, '');
});
test('lookup requires configuration and hides provider errors', async () => {
  await assert.rejects(lookupVenue({ query: 'Hall' }, { apiKey: '' }), { status: 503 });
  await assert.rejects(lookupVenue({ query: 'Hall' }, { apiKey: 'secret', fetchImpl: async () => { throw new Error('secret'); } }), (error) => error.status === 502 && !error.message.includes('secret'));
});
test('search encodes query and returns named matches only', async () => {
  const result = await lookupVenue({ query: 'Hall & Garden V2' }, { apiKey: 'secret', fetchImpl: async (url) => {
    assert.equal(url.hostname, 'api.geoapify.com');
    if (url.pathname === '/v1/geocode/search') {
      assert.equal(url.searchParams.get('type'), 'country');
      assert.equal(url.searchParams.get('filter'), 'countrycode:us');
      return { ok: true, json: async () => ({ features: [{ properties: { place_id: 'usa', country_code: 'us' } }] }) };
    }
    assert.equal(url.pathname, '/v2/places');
    assert.equal(url.searchParams.get('name'), 'Hall & Garden');
    assert.equal(url.searchParams.get('filter'), 'place:usa');
    return { ok: true, json: async () => ({ features: [{ properties: { place_id: 'id', name: 'Hall', country_code: 'us' } }, { properties: { place_id: 'other', name: 'Hall', country_code: 'ca' } }, { properties: { place_id: 'city' } }] }) };
  } });
  assert.equal(result.length, 1);
});

test('country selection also excludes out-of-country detail results', async () => {
  const result = await lookupVenue({ placeId: 'id', country: 'ca' }, { apiKey: 'secret', fetchImpl: async () => ({ ok: true, json: async () => ({ features: [{ properties: { place_id: 'id', name: 'Hall', country_code: 'us' } }] }) }) });
  assert.deepEqual(result, []);
});
