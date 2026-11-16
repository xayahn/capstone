import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, unknown> = {};
let requestHeaders: Headers | null = null;

vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  headers: async () => {
    if (!requestHeaders) throw new Error('headers() was called outside a request scope');
    return requestHeaders;
  },
}));

const { auditIpHash, keyedAddressHash, AUDIT_IP_HASH_KEY_MIN_LENGTH } = await import('../backend/security/audit-ip');

const KEY = 'k'.repeat(AUDIT_IP_HASH_KEY_MIN_LENGTH);
const expectedHash = (key: string, address: string) => createHmac('sha256', key).update(address).digest('hex');

beforeEach(() => {
  for (const name of Object.keys(env)) delete env[name];
  requestHeaders = null;
});

describe('audit network-address fingerprint', () => {
  it('matches an independent HMAC-SHA-256 implementation', async () => {
    expect(await keyedAddressHash(KEY, '203.0.113.7')).toBe(expectedHash(KEY, '203.0.113.7'));
  });

  it('records a keyed hash of the edge-reported address, never the raw address', async () => {
    env.AUDIT_IP_HASH_KEY = KEY;
    requestHeaders = new Headers({ 'cf-connecting-ip': '203.0.113.7' });
    const hash = await auditIpHash();
    expect(hash).toBe(expectedHash(KEY, '203.0.113.7'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('203.0.113.7');
  });

  it('normalizes IPv6 letter case so one address has one fingerprint', async () => {
    env.AUDIT_IP_HASH_KEY = KEY;
    requestHeaders = new Headers({ 'cf-connecting-ip': '2001:DB8::1' });
    expect(await auditIpHash()).toBe(expectedHash(KEY, '2001:db8::1'));
  });

  it('gives different fingerprints under different keys', async () => {
    requestHeaders = new Headers({ 'cf-connecting-ip': '203.0.113.7' });
    env.AUDIT_IP_HASH_KEY = KEY;
    const first = await auditIpHash();
    env.AUDIT_IP_HASH_KEY = 'z'.repeat(AUDIT_IP_HASH_KEY_MIN_LENGTH);
    expect(await auditIpHash()).not.toBe(first);
  });

  it('records nothing without a key of the minimum length', async () => {
    requestHeaders = new Headers({ 'cf-connecting-ip': '203.0.113.7' });
    expect(await auditIpHash()).toBeNull();
    env.AUDIT_IP_HASH_KEY = 'k'.repeat(AUDIT_IP_HASH_KEY_MIN_LENGTH - 1);
    expect(await auditIpHash()).toBeNull();
  });

  it('ignores client-supplied forwarding headers that can be forged', async () => {
    env.AUDIT_IP_HASH_KEY = KEY;
    requestHeaders = new Headers({ 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.2' });
    expect(await auditIpHash()).toBeNull();
  });

  it('rejects malformed address values', async () => {
    env.AUDIT_IP_HASH_KEY = KEY;
    for (const value of ['', 'not-an-address', '203.0.113.7; DROP TABLE users', 'x'.repeat(80)]) {
      requestHeaders = new Headers({ 'cf-connecting-ip': value });
      expect(await auditIpHash()).toBeNull();
    }
  });

  it('records nothing outside a request (seed scripts, background jobs)', async () => {
    env.AUDIT_IP_HASH_KEY = KEY;
    requestHeaders = null;
    expect(await auditIpHash()).toBeNull();
  });
});
