import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupGoogleVenues } from '../src/lib/googleVenueLookup.js';
import { reserveGoogleVenueSearch } from '../src/lib/rateLimiter.js';
import { publicIPv4, websiteURL, extractWebsiteVenues, importVenueWebsite, robotsAllows } from '../src/lib/venueWebsite.js';

test('Google country filtering, attribution and budget before provider request', async () => {
  let reserved = false;
  const places = await lookupGoogleVenues({ query: 'Hall', country: 'us' }, { apiKey: 'key', reserve: async () => { reserved = true; }, fetchImpl: async (_url, options) => {
    assert.ok(reserved);
    assert.equal(JSON.parse(options.body).regionCode, 'US');
    assert.ok(!options.headers['X-Goog-FieldMask'].includes('*'));
    const place = { id: 'one', displayName: { text: 'Hall' }, addressComponents: [{ types: ['country'], shortText: 'US' }], attributions: [{ provider: 'Data source', providerUri: 'https://example.com' }] };
    return { ok: true, json: async () => ({ places: [place, { ...place, id: 'two', addressComponents: [] }] }) };
  } });
  assert.equal(places.length, 1);
  assert.equal(places[0].attributions[0].name, 'Data source');
  assert.equal(places[0].address1, undefined);
});

test('Google does not call provider without configuration or budget', async () => {
  const fetchImpl = () => assert.fail('Must not call provider');
  await assert.rejects(lookupGoogleVenues({}, { apiKey: '', fetchImpl }), { status: 503 });
  await assert.rejects(lookupGoogleVenues({}, { apiKey: 'key', reserve: async () => { throw Object.assign(new Error('Limit'), { status: 429 }); }, fetchImpl }), { status: 429 });
});

test('budget fails closed and shared counter prevents calls beyond daily cap', async () => {
  await assert.rejects(reserveGoogleVenueSearch({ getRedis: async () => null }), { status: 503 });
  let count = 0;
  const options = { dailyLimit: 2, getRedis: async () => ({ eval: async (_script, args) => { assert.match(args.keys[0], /evl:google-venue-budget:\d{4}-\d{2}-\d{2}/); return ++count; } }) };
  const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => reserveGoogleVenueSearch(options)));
  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 2);
  assert.equal(outcomes.filter((item) => item.reason?.status === 429).length, 3);
});

test('website URLs and DNS reject internal and special addresses', () => {
  for (const url of ['http://venue.com', 'https://localhost', 'https://127.0.0.1', 'https://2130706433', 'https://[::1]', 'https://user:password@venue.com', 'https://venue.com:444']) assert.throws(() => websiteURL(url));
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '198.18.0.1', '::1', '224.0.0.1', '203.0.113.1']) assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4('8.8.8.8'), true);
});
const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'EventVenue', name: 'Example Hall', address: { streetAddress: '12 Main St', addressLocality: 'Town' }, telephone: '555-0100' }] })}</script>`;
test('website extraction keeps blanks and ignores malformed data and people', () => {
  const [venue] = extractWebsiteVenues(html);
  assert.equal(venue.name, 'Example Hall');
  assert.equal(venue.contactEmail, '');
  assert.equal(venue.zip, '');
  assert.deepEqual(extractWebsiteVenues('<script type="application/ld+json">broken</script>'), []);
  assert.deepEqual(extractWebsiteVenues(html.replace('EventVenue', 'Person')), []);
});
test('robots rules allow public pages but block restricted paths', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/public$\n';
  assert.equal(robotsAllows(robots, new URL('https://venue.com/')), true);
  assert.equal(robotsAllows(robots, new URL('https://venue.com/private')), false);
  assert.equal(robotsAllows(robots, new URL('https://venue.com/private/public')), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*?secret=', new URL('https://venue.com/path?secret=x')), false);
});
test('website import checks robots before each redirect and never follows internal URLs', async () => {
  const visited = [];
  const result = await importVenueWebsite('https://venue.com', { read: async (url) => {
    visited.push(url.href);
    return url.pathname === '/robots.txt' ? { status: 404 } : { status: 200, headers: { 'content-type': 'text/html' }, body: html };
  } });
  assert.equal(result.places.length, 1);
  assert.equal(visited[0], 'https://venue.com/robots.txt');
  await assert.rejects(importVenueWebsite('https://venue.com', { read: async (url) => url.pathname === '/robots.txt' ? { status: 404 } : { status: 302, headers: { location: 'https://127.0.0.1/' } } }), { status: 400 });
  await assert.rejects(importVenueWebsite('https://venue.com', { read: async () => ({ status: 200, body: 'User-agent: *\nDisallow: /' }) }), /restricts automated/);
});
