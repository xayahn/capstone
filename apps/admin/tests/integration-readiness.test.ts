import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { integrationReadiness } from '../backend/config/integration-readiness';
import { androidGoogleServicesProblems, checkIntegrations } from '../../../scripts/check-integrations.mjs';

describe('optional integration readiness', () => {
  it('keeps the core app usable when both integrations are disabled', () => {
    expect(integrationReadiness({})).toEqual({ assistant: 'disabled', pushNotifications: 'disabled', accountEmail: 'disabled' });
  });

  it('rejects an enabled assistant without its credential', () => {
    expect(() => integrationReadiness({ GEMINI_ENABLED: 'true' })).toThrow();
  });

  it('accepts the newer opaque Google authorization-key format', () => {
    expect(integrationReadiness({
      GEMINI_ENABLED: 'true',
      GEMINI_API_KEY: 'AQ.synthetic_authorization_key_123456789',
    }).assistant).toBe('configured');
  });

  it('rejects model URLs rather than treating them as provider configuration', () => {
    expect(() => integrationReadiness({ GEMINI_ENABLED: 'true', GEMINI_API_KEY: 'synthetic_test_key_123456789', GEMINI_MODEL: 'https://untrusted.example/model' })).toThrow();
  });

  it('rejects enabled push without both a project and a protected dispatcher', () => {
    expect(() => integrationReadiness({ PUSH_NOTIFICATIONS_ENABLED: 'true' })).toThrow();
    expect(() => integrationReadiness({ PUSH_NOTIFICATIONS_ENABLED: 'true', EXPO_PROJECT_ID: '00000000-0000-4000-8000-000000000001', PUSH_DISPATCH_SECRET: 'too-short' })).toThrow();
  });

  it('rejects misspelled feature flags instead of silently disabling a promised feature', () => {
    expect(() => integrationReadiness({ GEMINI_ENABLED: 'tru' })).toThrow();
    expect(() => integrationReadiness({ PUSH_NOTIFICATIONS_ENABLED: 'yes' })).toThrow();
  });

  it('reports configuration status without disclosing any secret', () => {
    const result = integrationReadiness({
      GEMINI_ENABLED: 'true',
      GEMINI_API_KEY: 'synthetic_gemini_secret_123456789',
      GEMINI_MODEL: 'gemini-3.8-flash',
      PUSH_NOTIFICATIONS_ENABLED: 'true',
      EXPO_PROJECT_ID: '00000000-0000-4000-8000-000000000001',
      PUSH_DISPATCH_SECRET: 'synthetic-dispatch-secret-at-least-32-characters',
    });
    expect(result).toEqual({ assistant: 'configured', pushNotifications: 'configured', accountEmail: 'disabled' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

describe('account mail readiness', () => {
  it('fails closed if email is enabled without delivery verification', () => {
    expect(() => integrationReadiness({ MAIL_ENABLED: 'true', RESEND_API_KEY: 're_test_private_key_12345', MAIL_FROM: 'noreply@example.test' })).toThrow();
  });
  it('reports configured only after the owner has verified delivery configuration', () => {
    const result = integrationReadiness({ MAIL_ENABLED: 'true', MAIL_DELIVERY_VERIFIED: 'true', RESEND_API_KEY: 're_test_private_key_12345', MAIL_FROM: 'noreply@example.test' });
    expect(result.accountEmail).toBe('configured'); expect(JSON.stringify(result)).not.toContain('re_test');
  });
  it('rejects invalid flags and injected sender headers', () => {
    expect(() => integrationReadiness({ MAIL_ENABLED: 'yes' })).toThrow();
    expect(() => integrationReadiness({ MAIL_ENABLED: 'true', MAIL_DELIVERY_VERIFIED: 'true', RESEND_API_KEY: 're_test_private_key_12345', MAIL_FROM: 'x@example.test\r\nBcc: victim@example.test' })).toThrow();
  });
});

const fixtureParent = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.validation-tmp');
const fixturePaths: string[] = [];
function fixture() {
  mkdirSync(fixtureParent, { recursive: true });
  const path = mkdtempSync(join(fixtureParent, 'integration-config-'));
  fixturePaths.push(path);
  return path;
}
afterEach(() => {
  vi.unstubAllGlobals();
  for (const path of fixturePaths.splice(0)) {
    // Every recursive removal is confined to the exact test-created directory.
    expect(dirname(resolve(path))).toBe(fixtureParent);
    expect(resolve(path).startsWith(join(fixtureParent, 'integration-config-'))).toBe(true);
    rmSync(path, { recursive: true, force: true });
  }
});
const packageName = 'ph.parishlink.mobile';
function firebaseClient(overrides: Record<string, unknown> = {}) {
  return {
    project_info: { project_id: 'parishlink-test', project_number: '123456789012' },
    client: [{
      client_info: { mobilesdk_app_id: '1:123456789012:android:abc123', android_client_info: { package_name: packageName } },
      api_key: [{ current_key: 'synthetic-public-client-key-never-print' }],
    }],
    ...overrides,
  };
}
function writeClient(path: string, value: unknown) {
  writeFileSync(join(path, 'google-services.json'), JSON.stringify(value));
}
describe('local Android Firebase integration configuration', () => {
  it('reports incomplete setup without a selected client file', () => {
    expect(androidGoogleServicesProblems({ mobileRoot: fixture(), packageName }))
      .toContain('ANDROID_GOOGLE_SERVICES_FILE or android.googleServicesFile is not configured');
  });
  it('reports a missing file without exposing its path', () => {
    const problems = androidGoogleServicesProblems({ mobileRoot: fixture(), packageName, filePath: './private-location.json' });
    expect(problems).toEqual(['Android Google services file is missing, unreadable or invalid JSON']);
    expect(JSON.stringify(problems)).not.toContain('private-location');
  });
  it('rejects invalid JSON without echoing its contents', () => {
    const path = fixture();
    writeFileSync(join(path, 'google-services.json'), '{secret-content-that-must-not-appear');
    const problems = androidGoogleServicesProblems({ mobileRoot: path, packageName, filePath: './google-services.json' });
    expect(problems).toHaveLength(1);
    expect(JSON.stringify(problems)).not.toContain('secret-content');
  });
  it('accepts a matching Android client and project identifiers without returning the client key', () => {
    const path = fixture();
    writeClient(path, firebaseClient());
    const problems = androidGoogleServicesProblems({ mobileRoot: path, packageName, filePath: './google-services.json' });
    expect(problems).toEqual([]);
    expect(JSON.stringify(problems)).not.toContain('synthetic-public');
  });
  it.each(['matching', 'other'] as const)('rejects a reused server-only Gemini key in the %s Android client', location => {
    const path = fixture(), key = 'synthetic-server-only-key-never-echo';
    const data = firebaseClient();
    if (location === 'matching') data.client[0]!.api_key.push({ current_key: key });
    else data.client.push({
      client_info: { mobilesdk_app_id: '1:123456789012:android:def456', android_client_info: { package_name: 'ph.other.mobile' } },
      api_key: [{ current_key: key }],
    });
    writeClient(path, data);
    const problems = androidGoogleServicesProblems({
      mobileRoot: path, packageName, filePath: './google-services.json', forbiddenServerKey: key,
    });
    expect(problems).toEqual(['Android Firebase client configuration reuses the server-only Gemini key; use a separate Firebase client key']);
    expect(JSON.stringify(problems)).not.toContain(key);
  });
  it('accepts a separate Firebase client key without imposing a provider key format', () => {
    const path = fixture();
    writeClient(path, firebaseClient());
    expect(androidGoogleServicesProblems({
      mobileRoot: path, packageName, filePath: './google-services.json',
      forbiddenServerKey: 'synthetic-server-only-key-never-echo',
    })).toEqual([]);
  });
  it('fails the actual CLI safely when the public client file contains the backend key', () => {
    const root = fixture(), mobileRoot = join(root, 'apps/mobile'), key = 'synthetic-server-only-key-never-echo';
    mkdirSync(mobileRoot, { recursive: true });
    mkdirSync(join(root, 'scripts'));
    // Use the actual script in an isolated synthetic project; never load the
    // developer's real provider configuration or credential files for this test.
    copyFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts/check-integrations.mjs'), join(root, 'scripts/check-integrations.mjs'));
    writeFileSync(join(mobileRoot, 'app.json'), JSON.stringify({ expo: { android: { package: packageName } } }));
    const data = firebaseClient();
    data.client[0]!.api_key[0]!.current_key = key;
    writeClient(mobileRoot, data);
    const cli = spawnSync(process.execPath, [join(root, 'scripts/check-integrations.mjs')], {
      cwd: root, encoding: 'utf8',
      env: {
        NODE_ENV: 'test',
        SystemRoot: process.env.SystemRoot,
        GEMINI_ENABLED: 'true', GEMINI_API_KEY: key,
        PUSH_NOTIFICATIONS_ENABLED: 'true', EXPO_PROJECT_ID: '00000000-0000-4000-8000-000000000001',
        EXPO_PUBLIC_EAS_PROJECT_ID: '00000000-0000-4000-8000-000000000001',
        PUSH_DISPATCH_SECRET: 'synthetic-dispatch-secret-at-least-32-characters',
        ANDROID_GOOGLE_SERVICES_FILE: './google-services.json',
      },
    });
    expect(cli.error).toBeUndefined();
    expect(cli.status).toBe(1);
    expect(cli.stdout).toContain('Gemini server configuration: present');
    expect(cli.stdout).toContain('Android Firebase client configuration: setup needed');
    expect(cli.stdout).toContain('reuses the server-only Gemini key');
    expect(cli.stdout + cli.stderr).not.toContain(key);
    expect(cli.stdout + cli.stderr).not.toContain('synthetic-dispatch-secret');
  });
  it('rejects a different Android application package', () => {
    const path = fixture();
    writeClient(path, firebaseClient());
    expect(androidGoogleServicesProblems({ mobileRoot: path, packageName: 'ph.other.mobile', filePath: './google-services.json' }))
      .toContain('Android Firebase client does not match the application package in app.json');
  });
  it.each([
    { project_id: '', project_number: '123456789012' },
    { project_id: 'parishlink-test', project_number: 'invalid[regex' },
    { project_id: 'parishlink-test', project_number: 123456789012 },
  ])('rejects incomplete or malformed project identifiers %j', project_info => {
    const path = fixture();
    writeClient(path, firebaseClient({ project_info }));
    expect(androidGoogleServicesProblems({ mobileRoot: path, packageName, filePath: './google-services.json' }).length).toBeGreaterThan(0);
  });
  it('rejects an Android app ID associated with a different project number', () => {
    const path = fixture();
    const client = firebaseClient();
    client.client[0]!.client_info.mobilesdk_app_id = '1:999999999999:android:abc123';
    writeClient(path, client);
    expect(androidGoogleServicesProblems({ mobileRoot: path, packageName, filePath: './google-services.json' }))
      .toContain('Android Firebase app ID is missing or does not match the project number');
  });
  it('does not accept a private FCM service-account credential as an app client file', () => {
    const path = fixture();
    writeClient(path, { type: 'service_account', private_key: 'synthetic-private-key-never-log', project_id: 'parishlink-test' });
    const problems = androidGoogleServicesProblems({ mobileRoot: path, packageName, filePath: './google-services.json' });
    expect(problems).toEqual(['Android Google services file must be the Firebase client configuration, not a private service-account credential']);
    expect(JSON.stringify(problems)).not.toContain('synthetic-private');
  });
  it('bounds file size and rejects a directory before parsing', () => {
    const path = fixture();
    writeFileSync(join(path, 'google-services.json'), 'x'.repeat(256_001));
    expect(androidGoogleServicesProblems({ mobileRoot: path, packageName, filePath: './google-services.json' }))
      .toContain('Android Google services file is not a supported configuration file');
    expect(androidGoogleServicesProblems({ mobileRoot: path, packageName, filePath: '.' }))
      .toContain('Android Google services file is not a supported configuration file');
  });
  it.each(['environment', 'app.json'] as const)('resolves configured files from apps/mobile via %s, preserves Gemini checks and never calls a provider', source => {
    const root = fixture(), mobileRoot = join(root, 'apps/mobile');
    mkdirSync(join(mobileRoot, 'native/firebase'), { recursive: true });
    writeFileSync(join(mobileRoot, 'app.json'), JSON.stringify({ expo: { android: {
      package: packageName, ...(source === 'app.json' ? { googleServicesFile: './native/firebase/google-services.json' } : {}),
    } } }));
    writeClient(join(mobileRoot, 'native/firebase'), firebaseClient());
    const fetch = vi.fn(() => { throw new Error('No provider request allowed'); });
    vi.stubGlobal('fetch', fetch);
    const environment = {
      GEMINI_ENABLED: 'true', GEMINI_API_KEY: 'synthetic-gemini-key-never-print',
      PUSH_NOTIFICATIONS_ENABLED: 'true', EXPO_PROJECT_ID: '00000000-0000-4000-8000-000000000001',
      EXPO_PUBLIC_EAS_PROJECT_ID: '00000000-0000-4000-8000-000000000001',
      PUSH_DISPATCH_SECRET: 'synthetic-dispatch-secret-at-least-32-characters',
      ...(source === 'environment' ? { ANDROID_GOOGLE_SERVICES_FILE: './native/firebase/google-services.json' } : {}),
      MAIL_ENABLED: 'true', MAIL_DELIVERY_VERIFIED: 'true',
      MAIL_FROM: 'noreply@example.test', RESEND_API_KEY: 're_synthetic_mail_key_12345',
    };
    const result = checkIntegrations(root, environment);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every(item => item.configured)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('synthetic');
    const missingGemini = checkIntegrations(root, { ...environment, GEMINI_API_KEY: '' });
    expect(missingGemini.checks.find(item => item.name === 'Gemini server configuration')?.configured).toBe(false);
  });
  it('reports email setup safely without assuming acceptance or exposing the sender or key', () => {
    const root = fixture();
    const configuration = { MAIL_ENABLED: 'true', MAIL_DELIVERY_VERIFIED: 'true', MAIL_FROM: 'private-sender@example.test', RESEND_API_KEY: 're_synthetic_mail_key_12345' };
    const checked = (env: Record<string, string>) => checkIntegrations(root, env).checks.find(item => item.name === 'Account recovery email configuration');
    expect(checked(configuration)?.configured).toBe(true);
    expect(checked({ ...configuration, MAIL_DELIVERY_VERIFIED: 'false' })?.configured).toBe(false);
    expect(checked({ ...configuration, MAIL_ENABLED: 'false' })?.configured).toBe(false);
    expect(checked({ ...configuration, MAIL_FROM: 'x@example.test\r\nBcc:y@example.test' })?.configured).toBe(false);
    expect(checked({ ...configuration, RESEND_API_KEY: '' })?.configured).toBe(false);
    expect(JSON.stringify(checked(configuration))).not.toMatch(/private-sender|re_synthetic/);
  });
});
