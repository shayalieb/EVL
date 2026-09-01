export const LINK_EXPIRATION_PRESETS = Object.freeze({
  '24_hours': 1,
  '3_days': 3,
  '7_days': 7,
  '14_days': 14,
  '30_days': 30,
  '90_days': 90,
});

const MAX_CUSTOM_DAYS = 365 * 5;

export function resolveLinkExpiration(selection, { defaultPreset = '7_days', now = new Date(), allowNever = true } = {}) {
  const requested = selection && typeof selection === 'object' ? selection : { preset: defaultPreset };
  const preset = requested.preset || defaultPreset;

  if (preset === 'never') {
    if (!allowNever) return { error: 'Links of this type must have an expiration date.' };
    return { expiresAt: null, preset: 'never' };
  }

  if (preset === 'custom') {
    const expiresAt = new Date(requested.expiresAt);
    if (!requested.expiresAt || Number.isNaN(expiresAt.getTime())) return { error: 'Choose a valid expiration date and time.' };
    if (expiresAt <= now) return { error: 'Expiration must be in the future.' };
    if (expiresAt.getTime() > now.getTime() + MAX_CUSTOM_DAYS * 86_400_000) return { error: 'Expiration cannot be more than five years from now.' };
    return { expiresAt, preset: 'custom' };
  }

  const days = LINK_EXPIRATION_PRESETS[preset];
  if (!days) return { error: 'Choose a supported link expiration.' };
  return { expiresAt: new Date(now.getTime() + days * 86_400_000), preset };
}

export function linkAvailability({ expiresAt, revokedAt, usedAt, singleUse = false }, now = new Date()) {
  if (revokedAt) return 'revoked';
  if (singleUse && usedAt) return 'used';
  if (expiresAt && new Date(expiresAt) <= now) return 'expired';
  return 'active';
}
