const FORMATTERS = new Map();

function formatter(timeZone) {
  if (!FORMATTERS.has(timeZone)) {
    FORMATTERS.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return FORMATTERS.get(timeZone);
}

function zonedParts(date, timeZone) {
  return Object.fromEntries(formatter(timeZone).formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
}

function offsetAt(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

function localPartsToDate(parts, timeZone) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let result = new Date(target - offsetAt(new Date(target), timeZone));
  result = new Date(target - offsetAt(result, timeZone));
  return result;
}

export function nextRecurringDate(remindAt, frequency, timeZone = 'UTC') {
  const current = zonedParts(new Date(remindAt), timeZone);
  if (frequency === 'monthly') {
    const targetMonth = current.month === 12 ? 1 : current.month + 1;
    const targetYear = current.month === 12 ? current.year + 1 : current.year;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    return localPartsToDate({ ...current, year: targetYear, month: targetMonth, day: Math.min(current.day, lastDay) }, timeZone);
  }
  const days = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 0;
  if (!days) return null;
  const shifted = new Date(Date.UTC(current.year, current.month - 1, current.day + days, current.hour, current.minute, current.second));
  return localPartsToDate({
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(),
    hour: current.hour, minute: current.minute, second: current.second,
  }, timeZone);
}
