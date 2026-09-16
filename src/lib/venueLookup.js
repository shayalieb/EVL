export function fillEmptyVenueFields(current = {}, found = {}) {
  const next = { ...current };
  for (const key of ['name', 'address1', 'city', 'state', 'zip', 'contactPhone', 'contactEmail']) {
    if (!String(next[key] || '').trim() && typeof found[key] === 'string' && found[key].trim()) next[key] = found[key].trim();
  }
  return next;
}
