import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSmallJson } from '../backend/http/small-json';

const request = (body: string) => new Request('http://localhost', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
});
afterEach(() => vi.useRealTimers());
describe('bounded private search input', () => {
  it('accepts an object', async () => {
    expect(await readSmallJson(request('{"query":"a name"}'))).toEqual({ query: 'a name' });
  });
  it('rejects unsupported content types and malformed JSON', async () => {
    await expect(readSmallJson(new Request('http://localhost',{method:'POST',body:'{}'}))).rejects.toMatchObject({status:415});
    await expect(readSmallJson(request('{'))).rejects.toMatchObject({status:400});
    await expect(readSmallJson(request('[]'))).rejects.toMatchObject({status:400});
  });
  it('bounds a body without Content-Length by bytes, including multibyte text', async () => {
    await expect(readSmallJson(request(JSON.stringify({query:'é'.repeat(2200)})))).rejects.toMatchObject({status:413});
  });
  it('bounds a stalled body and cancels its reader', async () => {
    vi.useFakeTimers();
    const cancel=vi.fn();
    const stalled = new Request('http://localhost', { method:'POST', headers:{'Content-Type':'application/json'},
      body: new ReadableStream({ cancel }), duplex:'half' } as RequestInit);
    const rejected=expect(readSmallJson(stalled)).rejects.toMatchObject({status:408});
    await vi.advanceTimersByTimeAsync(15_001);
    await rejected; expect(cancel).toHaveBeenCalledOnce();
  });
  it('enforces the administrative 12,000-byte limit during streaming', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(12_001)); }, cancel,
    });
    const streamed = new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit);
    await expect(readSmallJson(streamed, 12_000)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
