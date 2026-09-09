import { describe, expect, it } from 'vitest';
import { sha256Hex, validIdempotencyKey } from '../backend/security/idempotency';

describe('appointment idempotency helpers', () => {
  it('accepts bounded opaque retry keys', () => {
    expect(validIdempotencyKey('appt_550e8400-e29b-41d4-a716-446655440000')).toBe('appt_550e8400-e29b-41d4-a716-446655440000');
  });

  it.each([null, '', 'short', '*'.repeat(20), 'a'.repeat(129)])('rejects unsafe key %s', (value) => {
    expect(validIdempotencyKey(value)).toBeNull();
  });

  it('generates deterministic SHA-256 hashes without retaining the raw key', async () => {
    await expect(sha256Hex('logical-request-key')).resolves.toBe(
      '8e84826593198cf25489f9649ae4d6c5efc5e55933b384d34edd9e632816d2b6',
    );
  });
});
