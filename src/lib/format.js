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

export function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formatEmailInput(value || ''));
}

// WhatsApp's universal wa.me link opens the native app when the device has
// it available and otherwise falls back to WhatsApp Web. Contractor phone
// inputs are currently US-formatted, so an unqualified 10-digit number gets
// the US country code. Explicit international numbers must include "+".
export function buildWhatsAppClickToChatUrl({ recipientPhone, contractorName, eventName, eventDate } = {}) {
  const rawPhone = String(recipientPhone || '').trim();
  const digits = rawPhone.replace(/\D/g, '');
  let internationalPhone = '';
  if (rawPhone.startsWith('+') && digits.length >= 8 && digits.length <= 15) internationalPhone = digits;
  else if (digits.length === 10) internationalPhone = `1${digits}`;
  else if (digits.length === 11 && digits.startsWith('1')) internationalPhone = digits;
  if (!internationalPhone) return '';

  const firstName = String(contractorName || '').trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName}, ` : 'Hi, ';
  const eventLabel = String(eventName || '').trim() || 'an upcoming gig';
  const dateLabel = formatEventDate(eventDate);
  const message = `${greeting}I'm reaching out about ${eventLabel}${dateLabel ? ` on ${dateLabel}` : ''}.`;
  return `https://wa.me/${internationalPhone}?text=${encodeURIComponent(message)}`;
}

export function formatZip(value) {
  return value.replace(/\D/g, '').slice(0, 5);
}

// A pasted YouTube/Spotify/etc. share link is often missing its scheme
// (copied from an address bar that hides "https://", or typed by hand) —
// without it, the browser treats the href as a same-site relative path
// instead of an external link. Leaves anything that already has a scheme
// (including non-http ones, e.g. a deliberate `mailto:`) untouched.
export function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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
