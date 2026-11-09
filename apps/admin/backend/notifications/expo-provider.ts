export class PushProviderError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super('The push provider request could not be completed.');
    this.name = 'PushProviderError';
  }
}

const ENDPOINTS = {
  send: 'https://exp.host/--/api/v2/push/send',
  receipts: 'https://exp.host/--/api/v2/push/getReceipts',
} as const;

export type ExpoResult = { status: 'ok' | 'error'; id?: string; details?: { error?: string } };

export function providerErrorCode(result: ExpoResult): string {
  const value = result.details?.error;
  return ['DeviceNotRegistered', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId', 'InvalidCredentials'].includes(value ?? '')
    ? value as string : 'ProviderRejected';
}

/** Fixed endpoints, no redirects, bounded body and deadline; never expose messages/tokens in logs. */
export async function callExpo(
  operation: keyof typeof ENDPOINTS,
  payload: unknown,
  accessToken?: string,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      void reader?.cancel().catch(() => undefined);
      reject(new PushProviderError('ProviderTimeout', true));
    }, 8_000);
  });
  const request = async () => {
    const response = await fetcher(ENDPOINTS[operation], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      // Workers supports manual/follow, not the browser's redirect:error mode.
      // Keep credentials on the fixed provider origin and reject redirects below.
      body: JSON.stringify(payload), redirect: 'manual', signal: controller.signal,
    });
    if (response.redirected || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      void response.body?.cancel().catch(() => undefined);
      throw new PushProviderError('ProviderRedirectRejected', false);
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new PushProviderError(response.status === 429 ? 'ProviderRateLimited' : 'ProviderHttpError', response.status === 429 || response.status >= 500);
    }
    if (!response.body) throw new PushProviderError('ProviderInvalidResponse', true);
    reader = response.body.getReader();
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > 64_000) { await reader.cancel(); throw new PushProviderError('ProviderInvalidResponse', true); }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try {
      const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('shape');
      return result as Record<string, unknown>;
    } catch { throw new PushProviderError('ProviderInvalidResponse', true); }
  };
  try { return await Promise.race([request(), deadline]); }
  catch (error) {
    if (error instanceof PushProviderError) throw error;
    throw new PushProviderError('ProviderUnavailable', true);
  } finally {
    if (timer) clearTimeout(timer);
    try { reader?.releaseLock(); } catch { /* A timed-out stream may still be cancelling. */ }
  }
}

export function expoResult(value: unknown): ExpoResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.status !== 'ok' && item.status !== 'error') return null;
  const details = item.details && typeof item.details === 'object' && !Array.isArray(item.details)
    ? item.details as Record<string, unknown> : undefined;
  return {
    status: item.status,
    ...(typeof item.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(item.id) ? { id: item.id } : {}),
    ...(typeof details?.error === 'string' ? { details: { error: details.error } } : {}),
  };
}
