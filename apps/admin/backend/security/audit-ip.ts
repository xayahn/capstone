import { env } from 'cloudflare:workers';

/** Minimum length of the server-only key used to fingerprint network addresses. */
export const AUDIT_IP_HASH_KEY_MIN_LENGTH = 32;

const ADDRESS_PATTERN = /^[0-9a-f:.]{2,45}$/;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The requester's network address as reported by the Cloudflare edge
 * (`CF-Connecting-IP`). Client-supplied forwarding headers are ignored because
 * they can be forged. Returns null outside a request or when no valid address
 * is available.
 */
async function requestAddress(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers');
    const value = (await headers()).get('cf-connecting-ip')?.trim().toLowerCase() ?? '';
    return ADDRESS_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** HMAC-SHA-256 of an address under the server key, as lowercase hex. */
export async function keyedAddressHash(key: string, address: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(address)));
}

/**
 * Keyed fingerprint of the requester's network address for an audit entry.
 * The raw address is never stored. Without a configured key of at least
 * AUDIT_IP_HASH_KEY_MIN_LENGTH characters, nothing is recorded (null).
 */
export async function auditIpHash(): Promise<string | null> {
  const key = typeof env.AUDIT_IP_HASH_KEY === 'string' ? env.AUDIT_IP_HASH_KEY : '';
  if (key.length < AUDIT_IP_HASH_KEY_MIN_LENGTH) return null;
  const address = await requestAddress();
  return address ? keyedAddressHash(key, address) : null;
}
