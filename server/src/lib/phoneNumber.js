export function normalizeE164(value, defaultCountryCode = '1') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  const normalized = raw.startsWith('+') ? `+${digits}` : digits.length === 10 ? `+${defaultCountryCode}${digits}` : `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function displayPhone(value) {
  const phone = normalizeE164(value);
  if (!phone) return String(value || '');
  const digits = phone.slice(1);
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}
