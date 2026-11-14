import { describe, expect, it } from 'vitest';
import {
  evaluatePasswordRules,
  isEmailAddress,
  normalizeEmail,
  passwordValidationMessage,
} from '../src/lib/auth';

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

  it('evaluates individual password checklist rules and confirmation/current-password constraints', () => {
    expect(evaluatePasswordRules('Short1A')).toEqual({
      lengthOk: false,
      upperLowerOk: true,
      numberOk: true,
      matchOk: null,
      differentOk: null,
      allValid: false,
    });

    expect(evaluatePasswordRules('ParishLink2026', 'Mismatch2026')).toMatchObject({
      lengthOk: true,
      upperLowerOk: true,
      numberOk: true,
      matchOk: false,
      allValid: false,
    });

    expect(evaluatePasswordRules('ParishLink2026', 'ParishLink2026', 'ParishLink2026')).toMatchObject({
      matchOk: true,
      differentOk: false,
      allValid: false,
    });

    expect(evaluatePasswordRules('NewParish2026', 'NewParish2026', 'OldParish2026')).toEqual({
      lengthOk: true,
      upperLowerOk: true,
      numberOk: true,
      matchOk: true,
      differentOk: true,
      allValid: true,
    });

    expect(evaluatePasswordRules('A1' + 'b'.repeat(127)).lengthOk).toBe(false);
  });
});
