export const LINK_EXPIRATION_OPTIONS = [
  { value: '24_hours', label: '24 hours' },
  { value: '3_days', label: '3 days' },
  { value: '7_days', label: '7 days' },
  { value: '14_days', label: '14 days' },
  { value: '30_days', label: '30 days' },
  { value: '90_days', label: '90 days' },
  { value: 'custom', label: 'Custom date and time' },
  { value: 'never', label: 'Never expires' },
];

export function emptyLinkExpiration(preset = '7_days') {
  return { preset, expiresAt: '' };
}

export function serializeLinkExpiration(selection) {
  if (selection?.preset !== 'custom') return { preset: selection?.preset || '7_days' };
  const expiresAt = new Date(selection.expiresAt);
  return { preset: 'custom', expiresAt: Number.isNaN(expiresAt.getTime()) ? selection.expiresAt : expiresAt.toISOString() };
}

export function formatLinkExpiration(expiresAt) {
  if (!expiresAt) return 'Never expires';
  return `Expires ${new Date(expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}
