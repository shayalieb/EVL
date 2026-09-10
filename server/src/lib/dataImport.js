import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const MAX_CLIENT_ROWS = 5000;
const MAX_CALENDAR_EVENTS = 5000;

function clean(value, max = 2000) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().slice(0, max);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); if (row.some((cell) => cell.trim())) rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (quoted) throw new Error('The client CSV has an unclosed quoted field.');
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const HEADER_ALIASES = {
  firstName: ['first name', 'firstname', 'first'], lastName: ['last name', 'lastname', 'last'],
  fullName: ['name', 'full name', 'client name', 'customer name'], email: ['email', 'email address', 'client email'],
  phone: ['phone', 'phone number', 'mobile', 'cell'], address1: ['address', 'address 1', 'street', 'street address'],
  address2: ['address 2', 'suite', 'unit'], city: ['city'], state: ['state', 'province', 'region'],
  zip: ['zip', 'zip code', 'postal code', 'postcode'], notes: ['notes', 'note', 'comments'],
};

function headerKey(value) {
  const normalized = clean(value, 100).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0] || null;
}

function splitName(fullName) {
  const parts = clean(fullName, 240).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
}

export function normalizeEmail(value) {
  const email = clean(value, 320).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits : '';
}

export function parseClientsCsv(text) {
  if (!String(text || '').trim()) return { clients: [], errors: [], headers: [] };
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The client CSV needs a header row and at least one client row.');
  const headers = rows[0].map(headerKey);
  if (!headers.includes('fullName') && !(headers.includes('firstName') && headers.includes('lastName'))) {
    throw new Error('The client CSV needs either Name, or First Name and Last Name columns.');
  }
  const clients = [];
  const errors = [];
  rows.slice(1, MAX_CLIENT_ROWS + 1).forEach((cells, index) => {
    const raw = {};
    headers.forEach((key, cellIndex) => { if (key && raw[key] === undefined) raw[key] = clean(cells[cellIndex]); });
    const split = splitName(raw.fullName);
    const firstName = clean(raw.firstName || split.firstName, 120);
    const lastName = clean(raw.lastName || split.lastName, 120);
    const email = normalizeEmail(raw.email);
    const phoneNormalized = normalizePhone(raw.phone);
    const rowNumber = index + 2;
    const rowErrors = [];
    if (!firstName || !lastName) rowErrors.push('First and last name are required.');
    if (raw.email && !email) rowErrors.push('Email address is invalid.');
    if (!email && !phoneNormalized) rowErrors.push('An email address or phone number is required for safe matching.');
    if (rowErrors.length) errors.push({ rowNumber, messages: rowErrors });
    clients.push({
      rowId: `client-${rowNumber}`, rowNumber, firstName, lastName, email: email || null,
      phone: clean(raw.phone, 80) || null, phoneNormalized: phoneNormalized || null,
      address1: clean(raw.address1, 240) || null, address2: clean(raw.address2, 120) || null,
      city: clean(raw.city, 120) || null, state: clean(raw.state, 80) || null,
      zip: clean(raw.zip, 30) || null, notes: clean(raw.notes, 5000) || null,
      valid: rowErrors.length === 0,
    });
  });
  if (rows.length - 1 > MAX_CLIENT_ROWS) errors.push({ rowNumber: null, messages: [`Only the first ${MAX_CLIENT_ROWS} client rows can be imported at once.`] });
  return { clients, errors, headers: headers.filter(Boolean) };
}

function unfoldIcs(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeIcs(value) {
  return String(value || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function parseIcsDate(value) {
  const raw = clean(value, 80);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/);
  if (!match) return null;
  return { date: `${match[1]}-${match[2]}-${match[3]}`, time: match[4] ? `${match[4]}:${match[5]}` : null, allDay: !match[4] };
}

export function parseGoogleCalendarIcs(text) {
  if (!String(text || '').trim()) return { events: [], errors: [] };
  const source = unfoldIcs(text);
  if (!source.includes('BEGIN:VCALENDAR')) throw new Error('The calendar file is not a valid .ics export.');
  const blocks = source.match(/BEGIN:VEVENT\n[\s\S]*?\nEND:VEVENT/g) || [];
  const errors = [];
  const events = blocks.slice(0, MAX_CALENDAR_EVENTS).map((block, index) => {
    const properties = {};
    for (const line of block.split('\n').slice(1, -1)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const left = line.slice(0, colon);
      const key = left.split(';')[0].toUpperCase();
      if (!properties[key]) properties[key] = [];
      properties[key].push({ value: unescapeIcs(line.slice(colon + 1)), parameters: left.slice(key.length) });
    }
    const start = parseIcsDate(properties.DTSTART?.[0]?.value);
    const end = parseIcsDate(properties.DTEND?.[0]?.value);
    const summary = clean(properties.SUMMARY?.[0]?.value, 300);
    const status = clean(properties.STATUS?.[0]?.value, 40).toUpperCase();
    const attendeeEmails = (properties.ATTENDEE || []).map((entry) => normalizeEmail(entry.value.replace(/^mailto:/i, ''))).filter(Boolean);
    const eventErrors = [];
    if (!summary) eventErrors.push('Event title is missing.');
    if (!start) eventErrors.push('Start date is missing or unsupported.');
    if (status === 'CANCELLED') eventErrors.push('Cancelled event will not be imported.');
    if (properties.RRULE) eventErrors.push('Recurring series cannot be expanded safely; export individual occurrences or add them separately.');
    if (eventErrors.length) errors.push({ eventNumber: index + 1, title: summary || 'Untitled event', messages: eventErrors });
    return {
      rowId: `event-${index + 1}`, sourceUid: clean(properties.UID?.[0]?.value, 500) || null,
      eventName: summary, eventDate: start?.date || null, startTime: start?.time || null,
      endTime: end?.time || null, allDay: start?.allDay ?? true,
      timezone: (properties.DTSTART?.[0]?.parameters.match(/TZID=([^;:]+)/i)?.[1] || null),
      location: clean(properties.LOCATION?.[0]?.value, 1000) || null,
      description: clean(properties.DESCRIPTION?.[0]?.value, 5000) || null,
      attendeeEmails: [...new Set(attendeeEmails)], recurring: !!properties.RRULE,
      valid: eventErrors.length === 0,
    };
  });
  if (blocks.length > MAX_CALENDAR_EVENTS) errors.push({ eventNumber: null, title: null, messages: [`Only the first ${MAX_CALENDAR_EVENTS} calendar events can be imported at once.`] });
  return { events, errors };
}

export function sourceDigest(sources) {
  return createHash('sha256').update(JSON.stringify({ clientsCsv: sources.clientsCsv || '', calendarIcs: sources.calendarIcs || '' })).digest('hex');
}

export function createImportToken(accountId, digest, secret = process.env.SESSION_SECRET) {
  const payload = Buffer.from(JSON.stringify({ id: randomUUID(), accountId, digest, expiresAt: Date.now() + 30 * 60 * 1000 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyImportToken(token, accountId, digest, secret = process.env.SESSION_SECRET) {
  const [payload, supplied] = String(token || '').split('.');
  if (!payload || !supplied) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.accountId !== accountId || parsed.digest !== digest || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch { return null; }
}

export function stableImportId(importId, type, rowId) {
  const hex = createHash('sha256').update(`${importId}:${type}:${rowId}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}
