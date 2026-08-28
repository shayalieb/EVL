const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(value) {
  const normalized = normalizeEmail(value);
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

export function normalizeValidEmail(value) {
  const normalized = normalizeEmail(value);
  return isValidEmail(normalized) ? normalized : null;
}
