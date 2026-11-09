import { isEmailAddress, normalizeEmail, passwordValidationMessage } from './auth';
import type { PasswordResetInput } from '../types/domain';

export const normalizeAccountCode = (value: string) => value.trim().replace(/[\s-]/g, '').toUpperCase();
export const validAccountCode = (value: string) => /^[A-HJ-NP-Z2-9]{12}$/.test(normalizeAccountCode(value));

export function accountEmail(value: string): string {
  const normalized = normalizeEmail(value);
  if (!isEmailAddress(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}

export function accountCode(value: string): string {
  if (!validAccountCode(value)) throw new Error('Enter the 12-character code from your email. Letters I and O and digits 0 and 1 are not used.');
  return normalizeAccountCode(value);
}

export function passwordResetInput(value: PasswordResetInput): PasswordResetInput {
  const email = accountEmail(value.email);
  const code = accountCode(value.code);
  const passwordError = passwordValidationMessage(value.newPassword);
  if (passwordError) throw new Error(passwordError);
  if (value.newPassword !== value.confirmPassword) throw new Error('The new passwords do not match.');
  return { email, code, newPassword: value.newPassword, confirmPassword: value.confirmPassword };
}
