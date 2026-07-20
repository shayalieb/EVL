import crypto from 'crypto';

// Shared by auth.js (forgot-password) and admin.js (inviting a new
// account) — both need to email a raw token while only ever storing its
// hash, so a DB read alone can't be replayed to take over an account.
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}
