import { describe, expect, it } from 'vitest';
import { isEmailAddress, normalizeEmail, passwordValidationMessage } from '../src/lib/auth';

describe('parishioner authentication validation', () => {
  it('normalizes email addresses before account lookup', () => {
    expect(normalizeEmail('  Maria.Santos@Example.Test ')).toBe('maria.santos@example.test');
  });

  it('rejects malformed email addresses', () => {
    expect(isEmailAddress('maria@example.test')).toBe(true);
    expect(isEmailAddress('maria.example.test')).toBe(false);
    expect(isEmailAddress('maria@')).toBe(false);
  });

  it('enforces the mobile password baseline', () => {
    expect(passwordValidationMessage('short1')).toBeTruthy();
    expect(passwordValidationMessage('letters-only')).toBeTruthy();
    expect(passwordValidationMessage('parishlink2026')).toBeTruthy();
    expect(passwordValidationMessage('ParishLink2026')).toBeNull();
  });
});
