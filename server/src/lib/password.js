export const MIN_PASSWORD_LENGTH = 8;

export function passwordTooWeak(password) {
  return typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH;
}
