import { afterEach, describe, expect, it, vi } from 'vitest';
import configureApp from '../app.config';
import {
  normalizeApiBaseUrl,
  resolveDevelopmentLanApiBaseUrl,
  resolveRuntimeConfiguration,
} from '../src/config/environment';

afterEach(() => vi.unstubAllEnvs());

describe('mobile runtime configuration', () => {
  it.each(['https://feature.parishlink.ph/api', 'https://fd-api.parishlink.ph/api', 'https://fc-api.parishlink.ph/api'])('does not confuse public DNS names with private IPv6 prefixes: %s', apiBaseUrl => {
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_DEMO_MODE', 'false');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', apiBaseUrl);
    expect(resolveRuntimeConfiguration({ appEnvironment: 'production', demoMode: 'false', apiBaseUrl }).apiBaseUrl).toBe(apiBaseUrl);
    expect(() => configureApp({ config: { name: 'ParishLink', slug: 'parishlink' } } as Parameters<typeof configureApp>[0])).not.toThrow();
  });
  it.each(['https://[fc00::1]/api', 'https://[fd00::1]/api', 'https://[fe80::1]/api'])('still rejects a private IPv6 API in both configuration layers: %s', apiBaseUrl => {
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_DEMO_MODE', 'false');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', apiBaseUrl);
    expect(() => resolveRuntimeConfiguration({ appEnvironment: 'production', demoMode: 'false', apiBaseUrl })).toThrow();
    expect(() => configureApp({ config: { name: 'ParishLink', slug: 'parishlink' } } as Parameters<typeof configureApp>[0])).toThrow();
  });
  it('defaults a configuration-free development session to isolated demo mode', () => {
    expect(resolveRuntimeConfiguration({})).toEqual({
      environment: 'development',
      demoMode: true,
      apiBaseUrl: '',
      isProduction: false,
    });
  });

  it('accepts localhost HTTP only for development API mode', () => {
    expect(resolveRuntimeConfiguration({
      appEnvironment: 'development',
      demoMode: 'false',
      apiBaseUrl: ' http://localhost:3000/api/ ',
    })).toMatchObject({
      environment: 'development',
      demoMode: false,
      apiBaseUrl: 'http://localhost:3000/api',
    });
  });

  it('requires explicit API mode and a public HTTPS origin for production', () => {
    expect(resolveRuntimeConfiguration({
      appEnvironment: 'production',
      demoMode: 'false',
      apiBaseUrl: 'https://api.parishlink.ph/api/',
    })).toEqual({
      environment: 'production',
      demoMode: false,
      apiBaseUrl: 'https://api.parishlink.ph/api',
      isProduction: true,
    });

    expect(() => resolveRuntimeConfiguration({
      appEnvironment: 'production',
      demoMode: 'true',
      apiBaseUrl: 'https://api.parishlink.ph/api',
    })).toThrow('Production builds cannot enable ParishLink demonstration mode.');
  });

  it.each([
    'http://api.parishlink.ph/api',
    'https://localhost/api',
    'https://10.0.2.2/api',
    'https://192.168.1.20/api',
    'https://100.64.0.1/api',
    'https://198.51.100.10/api',
    'https://[::ffff:127.0.0.1]/api',
    'https://api.example/api',
  ])('rejects a non-production endpoint in a production build: %s', (apiBaseUrl) => {
    expect(() => resolveRuntimeConfiguration({
      appEnvironment: 'production',
      demoMode: 'false',
      apiBaseUrl,
    })).toThrow();
  });

  it('rejects an omitted or mistyped release flag instead of silently selecting a mode', () => {
    expect(() => resolveRuntimeConfiguration({
      appEnvironment: 'preview',
      apiBaseUrl: 'https://api.parishlink.ph/api',
    })).toThrow('EXPO_PUBLIC_DEMO_MODE must be explicitly true or false outside development.');
    expect(() => resolveRuntimeConfiguration({ demoMode: 'fasle' }))
      .toThrow('EXPO_PUBLIC_DEMO_MODE must be exactly true or false.');
  });

  it.each([
    'file:///tmp/api',
    'api.parishlink.ph/api',
    'https://user:password@api.parishlink.ph/api',
    'https://api.parishlink.ph/api?debug=true',
    'https://api.parishlink.ph/api#fragment',
  ])('rejects an unsafe or ambiguous API base URL: %s', (value) => {
    expect(() => normalizeApiBaseUrl(value)).toThrow();
  });

  it('adapts stale LAN or loopback development URLs to the active Metro or browser host without affecting release URLs', () => {
    expect(
      resolveDevelopmentLanApiBaseUrl('http://192.168.1.9:3000/api', 'development', {
        hostname: 'exp://192.168.1.25:8081',
        allowLoopback: false,
      }),
    ).toBe('http://192.168.1.25:3000/api');

    expect(
      resolveDevelopmentLanApiBaseUrl('http://192.168.1.9:3000/api', 'development', {
        hostname: 'localhost',
        allowLoopback: true,
      }),
    ).toBe('http://localhost:3000/api');

    expect(
      resolveDevelopmentLanApiBaseUrl('http://192.168.1.9:3000/api', 'development', {
        hostname: 'localhost:8081',
        allowLoopback: false,
      }),
    ).toBe('http://192.168.1.9:3000/api');

    expect(
      resolveDevelopmentLanApiBaseUrl('https://api.parishlink.ph/api', 'production', {
        hostname: '192.168.1.25',
        allowLoopback: false,
      }),
    ).toBe('https://api.parishlink.ph/api');
  });
});
