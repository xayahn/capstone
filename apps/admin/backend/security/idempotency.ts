const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export function validIdempotencyKey(value: string | null): string | null {
  if (!value) return null;
  const key = value.trim();
  return IDEMPOTENCY_KEY_PATTERN.test(key) ? key : null;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
