import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRequest, adminMutationKey, AdminAccessError } from '../frontend/lib/admin-request';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('admin network recovery', () => {
  it('does not follow a write redirect or forward its private body', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 307, headers: { Location: 'https://unexpected.example/' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(adminRequest('/api/admin/state', { method: 'POST', body: 'private form', redirect: 'follow' })).rejects.toEqual(new AdminAccessError(401));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/admin/state', expect.objectContaining({ redirect: 'manual' }));
  });
  it('recognizes the browser opaque redirect response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 0, type: 'opaqueredirect', body: null })));
    await expect(adminRequest('/api/admin/state')).rejects.toEqual(new AdminAccessError(401));
  });
  it('treats an unexpected API redirect as lost authentication', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, redirected: true, body: { cancel } })));
    cancel.mockResolvedValue(undefined);
    await expect(adminRequest('/api/admin/state')).rejects.toEqual(new AdminAccessError(401));
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([401, 403] as const)('surfaces HTTP %s without waiting for or parsing a private/error body', async status => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { status, headers: { 'Content-Type': 'text/html' } })));
    await expect(adminRequest('/api/admin/state')).rejects.toEqual(new AdminAccessError(status));
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('bounds requests when fetch does not honor abort', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const promise = adminRequest('/api/admin/state',{},10);
    const assertion = expect(promise).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
  });
  it('bounds stalled response bodies', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      headers: new Headers({'Content-Type':'application/json'}), json: () => new Promise(() => {}),
    })));
    const assertion = expect(adminRequest('/api/admin/state',{},10)).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(11); await assertion;
  });
  it('retains retry identity without persisting form content', async () => {
    const data = new Map<string,string>();
    vi.stubGlobal('sessionStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
    const first = await adminMutationKey('actor','private form text');
    expect(await adminMutationKey('actor','private form text')).toEqual(first);
    expect((await adminMutationKey('other-actor','private form text')).key).not.toEqual(first.key);
    expect(JSON.stringify([...data])).not.toContain('private form text');
  });
});
