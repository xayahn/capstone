export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const isEmailAddress = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export function passwordValidationMessage(password: string): string | null {
  if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Use 12–128 characters with uppercase and lowercase letters plus a number.';
  }
  return null;
}

export function assertAcceptablePassword(password: string): void {
  const message = passwordValidationMessage(password);
  if (message) throw new Error(message);
}
