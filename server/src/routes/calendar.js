import { Router } from 'express';

const router = Router();

function escapeText(str) {
  // \r isn't a valid TEXT-value character per RFC 5545 and has no defined
  // escape sequence — stripped outright so it can't combine with an
  // adjacent (escaped) \n to smuggle a real CRLF line break into the
  // output and inject additional ICS properties.
  return String(str).replace(/\r/g, '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// RFC 5545 §3.1: content lines over 75 octets must be "folded" with a
// leading space on the continuation, or strict calendar clients can reject
// or mis-parse the file — a real risk here since SUMMARY/LOCATION/
// DESCRIPTION are free text from the event.
function foldLine(line) {
  if (line.length <= 75) return line;
  let result = '';
  let rest = line;
  while (rest.length > 75) {
    result += `${rest.slice(0, 75)}\r\n `;
    rest = rest.slice(75);
  }
  return result + rest;
}

// Floating local time (no trailing Z, no TZID) rather than converting to
// UTC — we're only ever given a wall-clock time and a venue address, never
// an explicit timezone, and the contractors this is sent to are physically
// going to that venue, so "5:00 PM" should just mean 5:00 PM on their
// device without any (potentially wrong) zone conversion.
const ICS_DATETIME = /^\d{8}T\d{6}$/;

// Stateless by design: the server has no event/contractor tables (see
// server/README.md — that data lives in the frontend's own localStorage),
// so this route never looks anything up. It only ever formats whatever
// details the caller's own link supplies into a valid .ics file. Sending
// the same `uid` again with a higher `sequence` is what makes a calendar
// app treat this as an update to a previously added event instead of a
// duplicate — the standard mechanism real meeting-invite updates use.
router.get('/invite.ics', (req, res) => {
  const { uid, sequence, summary, location, description, start, end, attendeeEmail, attendeeName } = req.query;

  if (!uid || !summary || !ICS_DATETIME.test(start || '') || !ICS_DATETIME.test(end || '')) {
    return res.status(400).send('Missing or invalid calendar parameters.');
  }

  const dtstamp = `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GigWorks//Calendar Invite//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${escapeText(uid)}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SEQUENCE:${Number.parseInt(sequence, 10) || 0}`,
    `SUMMARY:${escapeText(summary)}`,
    location ? `LOCATION:${escapeText(location)}` : null,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    attendeeEmail ? `ATTENDEE;CN=${escapeText(attendeeName || attendeeEmail)};RSVP=TRUE:mailto:${attendeeEmail}` : null,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).map(foldLine);

  res.set('Content-Type', 'text/calendar; charset=utf-8; method=REQUEST');
  res.set('Content-Disposition', 'inline; filename="invite.ics"');
  res.send(lines.join('\r\n') + '\r\n');
});

export default router;
