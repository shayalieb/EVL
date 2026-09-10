import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleCalendarState, googleCalendarAuthorizationUrl, googleCalendarConfigured, googleEventsToIcs, verifyGoogleCalendarState } from '../src/lib/googleCalendar.js';

const env = { GOOGLE_CALENDAR_CLIENT_ID: 'client-id', GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret', GOOGLE_CALENDAR_REDIRECT_URI: 'https://api.example.com/api/integrations/google-calendar/callback', GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: 'a-secure-calendar-token-key-that-is-long-enough' };

test('Google Calendar OAuth requests only read-only calendar access', () => {
  assert.equal(googleCalendarConfigured(env), true);
  const url = new URL(googleCalendarAuthorizationUrl({ state: 'signed-state' }, env));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('scope').includes('calendar.events.readonly'), true);
  assert.equal(url.searchParams.get('scope').includes('calendar.calendarlist.readonly'), true);
  assert.equal(url.searchParams.get('scope').includes('calendar.events '), false);
});

test('Google Calendar OAuth state is signed, user-bound, and expiring', () => {
  const state = createGoogleCalendarState({ accountId: 'account-1', userId: 'user-1', now: 1000 }, 'session-secret');
  assert.equal(verifyGoogleCalendarState(state, { userId: 'user-1', now: 2000 }, 'session-secret').accountId, 'account-1');
  assert.throws(() => verifyGoogleCalendarState(state, { userId: 'user-2', now: 2000 }, 'session-secret'));
  assert.throws(() => verifyGoogleCalendarState(state, { userId: 'user-1', now: 700000 }, 'session-secret'));
});

test('Google events become separate importable VEVENT records', () => {
  const ics = googleEventsToIcs([
    { id: 'one', iCalUID: 'shared@example.com', summary: 'First gig', start: { dateTime: '2026-09-10T18:00:00-04:00' }, end: { dateTime: '2026-09-10T20:00:00-04:00' } },
    { id: 'two', iCalUID: 'second@example.com', summary: 'Second gig', start: { date: '2026-09-11' }, end: { date: '2026-09-12' } },
  ]);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /DTSTART:20260910T220000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260911/);
});
