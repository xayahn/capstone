import { afterEach, describe, expect, it, vi } from 'vitest';

const { env, runtime } = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  runtime: {
    getRawDb: vi.fn(),
    ensureRuntimeDatabase: vi.fn(async () => {}),
    ensurePublicRuntimeDatabase: vi.fn(async () => {}),
  },
}));
vi.mock('cloudflare:workers', () => ({ env, waitUntil: vi.fn() }));
vi.mock('@/db/runtime', () => runtime);

import {
  DEMO_DEPLOYMENT_PASSWORD_ITERATIONS,
  isDemoDeployment,
  passwordHashIterations,
  STANDARD_PASSWORD_ITERATIONS,
} from '../backend/config/deployment-mode';
import { GET as readiness } from '../backend/routes/system/ready';

function resetEnv() {
  for (const key of Object.keys(env)) delete env[key];
  env.DB = { prepare: () => ({ first: async () => ({ ready: 1 }) }) };
  env.FILES = {};
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnv();
});

describe('online demonstration flag', () => {
  it('is off by default and uses the standard 210,000 iterations', () => {
    resetEnv();
    expect(isDemoDeployment()).toBe(false);
    expect(STANDARD_PASSWORD_ITERATIONS).toBe(210_000);
    expect(passwordHashIterations()).toBe(210_000);
  });

  it('turns on only for the exact value "true"', () => {
    for (const value of ['TRUE', 'True', '1', 'yes', ' true', 'true ', true, 1]) {
      env.DEMO_DEPLOYMENT = value;
      expect(isDemoDeployment()).toBe(false);
      expect(passwordHashIterations()).toBe(210_000);
    }
    env.DEMO_DEPLOYMENT = 'true';
    expect(isDemoDeployment()).toBe(true);
    // Cloudflare Workers rejects PBKDF2 above 100,000 iterations.
    expect(DEMO_DEPLOYMENT_PASSWORD_ITERATIONS).toBe(100_000);
    expect(passwordHashIterations()).toBe(100_000);
  });
});

describe('/ready in production', () => {
  it('still refuses to report ready without a document scanner when the flag is absent', async () => {
    resetEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const response = await readiness();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'not_ready' });
  });

  it('refuses a flag value other than exactly "true"', async () => {
    resetEnv();
    env.DEMO_DEPLOYMENT = 'TRUE';
    vi.stubEnv('NODE_ENV', 'production');
    expect((await readiness()).status).toBe(503);
  });

  it('reports the demonstration mode openly when the flag is set', async () => {
    resetEnv();
    env.DEMO_DEPLOYMENT = 'true';
    vi.stubEnv('NODE_ENV', 'production');
    const response = await readiness();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ready',
      deployment: 'demo-fictional-data-only',
      checks: { documentScanner: 'demo-deployment-prefilter-only', passwordHashing: 'pbkdf2-sha256-100000' },
    });
  });

  it('reports a configured scanner and the standard settings without the flag', async () => {
    resetEnv();
    env.DOCUMENT_SCANNER = { fetch: async () => Response.json({}) };
    vi.stubEnv('NODE_ENV', 'production');
    const response = await readiness();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      deployment: 'standard',
      checks: { privateStorage: 'configured', documentScanner: 'configured', passwordHashing: 'pbkdf2-sha256-210000' },
    });
  });

  it('allows DEMO_FILES_KV only when DEMO_DEPLOYMENT is exactly "true", and refuses it otherwise', async () => {
    resetEnv();
    delete env.FILES;
    env.DEMO_FILES_KV = { put: async () => {}, getWithMetadata: async () => ({ value: null, metadata: null }), delete: async () => {} };
    env.DOCUMENT_SCANNER = { fetch: async () => Response.json({}) };
    vi.stubEnv('NODE_ENV', 'production');
    expect((await readiness()).status).toBe(503);

    delete env.DOCUMENT_SCANNER;
    env.DEMO_DEPLOYMENT = 'true';
    const response = await readiness();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ready',
      deployment: 'demo-fictional-data-only',
      checks: {
        privateStorage: 'demo-kv',
        documentScanner: 'demo-deployment-prefilter-only',
        passwordHashing: 'pbkdf2-sha256-100000',
      },
    });
  });
});
