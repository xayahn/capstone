export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const isEmailAddress = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export interface PasswordRuleStatus {
  lengthOk: boolean;
  upperLowerOk: boolean;
  numberOk: boolean;
  matchOk: boolean | null;
  differentOk: boolean | null;
  allValid: boolean;
}

export function evaluatePasswordRules(
  password: string,
  confirmPassword?: string,
  currentPassword?: string,
): PasswordRuleStatus {
  const lengthOk = password.length >= 12 && password.length <= 128;
  const upperLowerOk = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const numberOk = /\d/.test(password);
  const matchOk =
    confirmPassword === undefined
      ? null
      : password.length > 0 && password === confirmPassword;
  const differentOk =
    currentPassword === undefined
      ? null
      : password.length > 0 && password !== currentPassword;
  return {
    lengthOk,
    upperLowerOk,
    numberOk,
    matchOk,
    differentOk,
    allValid:
      lengthOk &&
      upperLowerOk &&
      numberOk &&
      (matchOk === null || matchOk) &&
      (differentOk === null || differentOk),
  };
}

export function passwordValidationMessage(password: string): string | null {
  const rules = evaluatePasswordRules(password);
  if (!rules.allValid) {
    return 'Use 12–128 characters with uppercase and lowercase letters plus a number.';
  }
  return null;
}

export function assertAcceptablePassword(password: string): void {
  const message = passwordValidationMessage(password);
  if (message) throw new Error(message);
}
