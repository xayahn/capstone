import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { env } = vi.hoisted(() => ({ env: { MOBILE_ALLOWED_ORIGINS: undefined as string | undefined } }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('../db/runtime', () => ({ ensurePublicRuntimeDatabase: vi.fn(), getRawDb: vi.fn() }));
import { mobileJson, mobileOptions, mobileRoute, readMobileJson } from '../backend/http/mobile-http';

const request = (body: BodyInit, headers: Record<string, string> = {}) => new Request('http://localhost/api/mobile/auth/sign-up', {
  method: 'POST', body, headers: { 'Content-Type': 'application/json', ...headers }, duplex: 'half',
} as RequestInit);
beforeEach(() => { env.MOBILE_ALLOWED_ORIGINS = undefined; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('mobile HTTP intake and origin failure boundary', () => {
  it('stops oversized streaming input before the stream finishes', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(24_001)); }, cancel });
    const incoming = request(body);
    const response = await mobileRoute(incoming, async () => mobileJson(await readMobileJson(incoming)));
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('returns 408 and cancels a stalled mobile body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const incoming = request(new ReadableStream({ cancel }));
    const response = mobileRoute(incoming, async () => mobileJson(await readMobileJson(incoming)));
    await vi.advanceTimersByTimeAsync(15_001);
    expect((await response).status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('accepts normal JSON and rejects invalid formats without internal errors', async () => {
    await expect(readMobileJson(request('{"name":"Test"}'))).resolves.toEqual({ name: 'Test' });
    for (const body of ['{', 'null', '[]']) await expect(readMobileJson(request(body))).rejects.toMatchObject({ status: 400 });
    await expect(readMobileJson(request('{}', { 'Content-Type': 'application/json-not-really' }))).rejects.toMatchObject({ status: 415 });
  });
  it('fails closed with a safe 503 when origin configuration is invalid', async () => {
    env.MOBILE_ALLOWED_ORIGINS = '*';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const work = vi.fn(async () => mobileJson({ private: 'never returned' }));
    const incoming = request('{}', { Origin: 'https://browser.example.test' });
    const response = await mobileRoute(incoming, work);
    expect(response.status).toBe(503);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(work).not.toHaveBeenCalled();
    expect(mobileOptions(incoming).status).toBe(503);
  });
  it('preserves CORS and safe errors for an approved browser origin', async () => {
    env.MOBILE_ALLOWED_ORIGINS = 'https://browser.example.test';
    const incoming = request('{', { Origin: 'https://browser.example.test' });
    const response = await mobileRoute(incoming, async () => mobileJson(await readMobileJson(incoming)));
    expect(response.status).toBe(400);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://browser.example.test');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
});
