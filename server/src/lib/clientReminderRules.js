// Pure date and key helpers for the client-level automatic reminders in
// reminderRuleEngine.js. Dates are 'YYYY-MM-DD' strings (events store them as
// opaque text), handled in UTC so a server's timezone never shifts a day.

export const REBOOK_KEY_PREFIX = 'client-rebook:';
export const ANNIVERSARY_KEY_PREFIX = 'client-anniversary:';
export const MAX_REBOOK_MONTHS = 36;

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// Calendar-month arithmetic that clamps the day (31 Mar - 1 month = 28/29 Feb).
export function addMonthsISO(dateISO, months) {
  const d = parse(dateISO);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return iso(target);
}

export function addDaysToISO(dateISO, days) {
  const d = parse(dateISO);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

export function boundedInt(value, fallback, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export const rebookKey = (lastEventDate) => `${REBOOK_KEY_PREFIX}${lastEventDate}`;
export const parseRebookKey = (key) => (String(key || '').startsWith(REBOOK_KEY_PREFIX) ? key.slice(REBOOK_KEY_PREFIX.length) : null);
export const anniversaryKey = (eventId, year) => `${ANNIVERSARY_KEY_PREFIX}${eventId}:${year}`;
export function parseAnniversaryKey(key) {
  const text = String(key || '');
  if (!text.startsWith(ANNIVERSARY_KEY_PREFIX)) return null;
  const rest = text.slice(ANNIVERSARY_KEY_PREFIX.length);
  const cut = rest.lastIndexOf(':');
  const year = Number(rest.slice(cut + 1));
  return cut > 0 && Number.isInteger(year) ? { eventId: rest.slice(0, cut), year } : null;
}

// The dates in [today, today + leadDays] as { suffix: '-MM-DD', date } so event
// dates can be matched by month and day, whatever their year.
export function anniversaryWindow(todayISO, leadDays) {
  const days = [];
  for (let i = 0; i <= leadDays; i += 1) {
    const date = addDaysToISO(todayISO, i);
    days.push({ suffix: date.slice(4), date });
  }
  return days;
}

// How many whole years ago an event was, relative to the anniversary date.
export function yearsBetween(eventDateISO, anniversaryISO) {
  return Number(anniversaryISO.slice(0, 4)) - Number(eventDateISO.slice(0, 4));
}
