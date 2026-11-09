import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MobileApiClient,
  MobileApiError,
  MobileApiTimeoutError,
} from '../src/api/mobileApiClient';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MobileApiClient', () => {
  it('never sends an already-cancelled request', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController(); caller.abort();
    await expect(new MobileApiClient('https://example.test/api', () => 'token').request('/mobile/snapshot', { signal: caller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity])('rejects an invalid per-request deadline: %s', async timeout => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(new MobileApiClient('https://example.test/api', () => '').request('/mobile/snapshot', {}, timeout)).rejects.toBeInstanceOf(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('recognizes a browser opaque login redirect without reading its body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 0, type: 'opaqueredirect', body: null })));
    await expect(new MobileApiClient('https://example.test/api', () => 'token').request('/mobile/snapshot')).rejects.toMatchObject({ status: 401 });
  });
  it('retains a 401 denial even when its response body never arrives', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 401 })));
    const client = new MobileApiClient('https://example.test/api', () => 'token', 50);
    const rejected = expect(client.request('/mobile/snapshot')).rejects.toMatchObject({ name: 'MobileApiError', status: 401 });
    await vi.advanceTimersByTimeAsync(51);
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('does not let callers enable redirects for private form submissions', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 307, headers: { Location: 'https://unexpected.example/' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new MobileApiClient('https://example.test/api', () => 'token');
    await expect(client.request('/mobile/auth/sign-in', { method: 'POST', body: 'private form', redirect: 'follow' })).rejects.toThrow('redirect');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', credentials: 'omit' });
  });
  it('honors cancellation even when the transport ignores abort', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const caller = new AbortController();
    const client = new MobileApiClient('https://example.test/api', () => '', 50);
    const rejected = expect(client.request('/mobile/snapshot', { signal: caller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    caller.abort();
    await vi.advanceTimersByTimeAsync(51);
    await rejected;
  });
  it('reads the current token for every request and owns the authorization header', async () => {
    let token = ' first-token ';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ request: 1 }))
      .mockResolvedValueOnce(jsonResponse({ request: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new MobileApiClient('https://example.test/api', () => token);

    await client.request('/mobile/snapshot', {
      headers: { Authorization: 'Bearer caller-token' },
    });
    token = 'second-token';
    await client.request('/mobile/snapshot');

    const firstHeaders = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers);
    const secondHeaders = new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.headers);
    expect(firstHeaders.get('Authorization')).toBe('Bearer first-token');
    expect(secondHeaders.get('Authorization')).toBe('Bearer second-token');
  });

  it('preserves the appointment idempotency key while owning authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'appointment-one' }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new MobileApiClient('https://example.test/api', () => 'token');

    await client.request('/mobile/appointments', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'appointment-123e4567-e89b-42d3-a456-426614174000' },
      body: JSON.stringify({ serviceId: 'baptism' }),
    });

    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers);
    expect(headers.get('Idempotency-Key')).toBe('appointment-123e4567-e89b-42d3-a456-426614174000');
    expect(headers.get('Authorization')).toBe('Bearer token');
  });

  it('turns a total request timeout into a stable user-safe error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const client = new MobileApiClient('https://example.test/api', () => '', 50);

    const request = client.request('/mobile/assistant');
    const assertion = expect(request).rejects.toBeInstanceOf(MobileApiTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it('does not relabel an explicit caller cancellation as a timeout', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const fail = () => reject(new DOMException('The request was cancelled.', 'AbortError'));
      if (init?.signal?.aborted) fail();
      else init?.signal?.addEventListener('abort', fail, { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const client = new MobileApiClient('https://example.test/api', () => '', 5_000);

    const request = client.request('/mobile/snapshot', { signal: caller.signal });
    caller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await expect(request).rejects.not.toBeInstanceOf(MobileApiTimeoutError);
  });

  it('parses current and forward-contract JSON errors without exposing HTML', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Sign in to continue.' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'That slot is no longer available.' } }, 409))
      .mockResolvedValueOnce(new Response('<h1>Proxy diagnostics</h1>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new MobileApiClient('https://example.test/api', () => 'token');

    await expect(client.request('/mobile/one')).rejects.toMatchObject({
      name: 'MobileApiError',
      message: 'Sign in to continue.',
      status: 401,
    } satisfies Partial<MobileApiError>);
    await expect(client.request('/mobile/two')).rejects.toMatchObject({
      message: 'That slot is no longer available.',
      status: 409,
    } satisfies Partial<MobileApiError>);
    await expect(client.request('/mobile/three')).rejects.toMatchObject({
      message: 'ParishLink API returned 502.',
      status: 502,
    } satisfies Partial<MobileApiError>);
  });

  it('rejects a successful response that violates the JSON contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })));
    const client = new MobileApiClient('https://example.test/api', () => '');

    await expect(client.request('/mobile/snapshot')).rejects.toMatchObject({
      name: 'MobileApiError',
      message: 'The ParishLink server returned an unexpected response format.',
      status: 200,
    } satisfies Partial<MobileApiError>);
  });

  it.each([
    'https://attacker.test/mobile/snapshot',
    '//attacker.test/mobile/snapshot',
    '/admin/state',
    '/mobile/../admin/state',
    '/mobile/%2e%2e/admin/state',
  ])('rejects a path that could escape the mobile API boundary: %s', async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new MobileApiClient('https://example.test/api/', () => '');

    await expect(client.request(path)).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
