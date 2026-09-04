import crypto from 'node:crypto';

function encryptionKey(secret = process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY) {
  if (!secret || secret.length < 32) throw new Error('QuickBooks token encryption is not configured.');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(value, secret) {
  const [version, iv, tag, ciphertext] = String(value || '').split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Encrypted secret has an invalid format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
