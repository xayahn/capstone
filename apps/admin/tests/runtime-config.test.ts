import { describe, expect, it } from 'vitest';
import { mobileAllowedOrigins, publicReleaseVersion } from '../backend/config/runtime-config';

describe('production runtime configuration', () => {
  it('permits only the known local mobile web origins by default in development', () => {
    expect([...mobileAllowedOrigins(undefined, true)]).toEqual([
      'http://localhost:8081',
      'http://127.0.0.1:8081',
    ]);
    expect(mobileAllowedOrigins(undefined, false).size).toBe(0);
  });

  it('accepts exact HTTPS production origins and removes duplicates', () => {
    expect([...mobileAllowedOrigins(
      'https://mobile.parishlink.example, https://mobile.parishlink.example',
      false,
    )]).toEqual(['https://mobile.parishlink.example']);
  });

  it.each([
    '*',
    'http://mobile.parishlink.example',
    'https://mobile.parishlink.example/path',
    'https://user:password@mobile.parishlink.example',
    'not-an-origin',
  ])('rejects unsafe production origin configuration: %s', (value) => {
    expect(() => mobileAllowedOrigins(value, false)).toThrow();
  });

  it('exposes only bounded release labels', () => {
    expect(publicReleaseVersion('2026.08.29-rc1')).toBe('2026.08.29-rc1');
    expect(publicReleaseVersion('<script>')).toBe('unversioned');
    expect(publicReleaseVersion(undefined)).toBe('unversioned');
  });
});
