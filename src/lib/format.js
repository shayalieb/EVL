export function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  const len = digits.length;
  if (len === 0) return '';
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatEmailInput(value) {
  return value.trim().toLowerCase();
}

export function formatCurrency(n, { maximumFractionDigits } = {}) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    ...(maximumFractionDigits !== undefined ? { maximumFractionDigits } : {}),
  }).format(n || 0);
}

export function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatVenueLine(venue) {
  if (!venue) return '';
  const cityStateZip = venue.city || venue.state || venue.zip
    ? `${venue.city || ''}${venue.city && venue.state ? ', ' : ''}${venue.state || ''}${venue.zip ? ` ${venue.zip}` : ''}`.trim()
    : '';
  return [venue.name, venue.address1, venue.address2, cityStateZip].filter(Boolean).join(', ');
}

export function formatEventTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
