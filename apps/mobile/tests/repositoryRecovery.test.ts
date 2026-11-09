import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateAppointmentInput } from '../src/types/domain';
const { storage, tokenStore } = vi.hoisted(() => ({
  storage: new Map<string,string>(),
  tokenStore: { getMobileApiToken: vi.fn(), setMobileApiToken: vi.fn(), clearMobileApiToken: vi.fn() },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key:string) => storage.get(key) ?? null,
  setItem: async (key:string,value:string) => { storage.set(key,value); },
} }));
vi.mock('expo-crypto', async () => {
  const crypto = await import('node:crypto');
  return { randomUUID: crypto.randomUUID, CryptoDigestAlgorithm: { SHA256:'sha256' },
    digestStringAsync: async (_algorithm:string,value:string) => crypto.createHash('sha256').update(value).digest('hex') };
});
vi.mock('react-native', () => ({ Platform: { OS:'web' } }));
vi.mock('../src/api/tokenStore', () => tokenStore);
import { ApiParishLinkRepository } from '../src/repositories/parishLinkRepository';
const session = { mode:'api', accessToken:'synthetic-token', profile: { id:'synthetic-user' } };
const json = (data:unknown,status=200) => Response.json(data,{status});
beforeEach(() => { vi.resetAllMocks(); storage.clear(); tokenStore.getMobileApiToken.mockResolvedValue('synthetic-token'); tokenStore.clearMobileApiToken.mockResolvedValue(undefined); tokenStore.setMobileApiToken.mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllGlobals());
describe('API repository credential and retry recovery', () => {
  it('requests a reset with a normalized email and no local sign-in side effect', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => json({ accepted: true }, 202));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await repository.requestPasswordReset(' USER@EXAMPLE.TEST ');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0]).endsWith('/mobile/auth/password-reset/request')).toBe(true);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ email: 'user@example.test' });
    expect(tokenStore.setMobileApiToken).not.toHaveBeenCalled();
  });
  it('normalizes reset codes, confirms without auto-login and requires an explicit subsequent sign-in', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async url =>
      String(url).endsWith('/sign-in') ? json(session) : new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await repository.confirmPasswordReset({ email: ' USER@EXAMPLE.TEST ', code: 'abcd-efgh-jk23',
      newPassword: 'SyntheticPassword7', confirmPassword: 'SyntheticPassword7' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokenStore.setMobileApiToken).not.toHaveBeenCalled();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      email: 'user@example.test', code: 'ABCDEFGHJK23', newPassword: 'SyntheticPassword7', confirmPassword: 'SyntheticPassword7',
    });
    await repository.signIn({ email: 'user@example.test', password: 'SyntheticPassword7' });
    expect(tokenStore.setMobileApiToken).toHaveBeenCalledExactlyOnceWith('synthetic-token');
  });
  it('clears an existing local credential only after a confirmed reset', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async url =>
      String(url).endsWith('/sign-in') ? json(session) : new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await repository.signIn({ email: 'user@example.test', password: 'test-only' });
    await repository.confirmPasswordReset({ email: 'user@example.test', code: 'ABCDEFGHJK23',
      newPassword: 'SyntheticPassword7', confirmPassword: 'SyntheticPassword7' });
    expect(tokenStore.clearMobileApiToken).toHaveBeenCalledTimes(1);
    await repository.loadSnapshot();
    expect(new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).has('Authorization')).toBe(false);
  });
  it('does not treat an unexpected reset acknowledgement as a confirmed password change', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ accepted: true })));
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await expect(repository.confirmPasswordReset({ email: 'user@example.test', code: 'ABCDEFGHJK23',
      newPassword: 'SyntheticPassword7', confirmPassword: 'SyntheticPassword7' })).rejects.toThrow('could not be confirmed');
    expect(tokenStore.clearMobileApiToken).not.toHaveBeenCalled();
  });
  it('rejects invalid recovery inputs before making any request', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await expect(repository.requestPasswordReset('invalid')).rejects.toThrow('valid email');
    await expect(repository.confirmPasswordReset({ email: 'user@example.test', code: 'wrong',
      newPassword: 'SyntheticPassword7', confirmPassword: 'SyntheticPassword7' })).rejects.toThrow('12-character');
    await expect(repository.confirmPasswordReset({ email: 'user@example.test', code: 'ABCDEFGHJK23',
      newPassword: 'short', confirmPassword: 'short' })).rejects.toThrow('12–128');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not manufacture email verification from a missing or false server flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ emailVerified: false })));
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await expect(repository.confirmEmailVerification('abcd efgh jk23')).rejects.toThrow('could not be confirmed');
  });
  it('uses the verification endpoint and sends only the canonical code', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async url =>
      json(String(url).endsWith('/request') ? { accepted: true } : { emailVerified: true }));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await repository.requestEmailVerification();
    await repository.confirmEmailVerification(' abcd-efgh-jk23 ');
    expect(String(fetchMock.mock.calls[0]?.[0]).endsWith('/mobile/auth/email-verification/request')).toBe(true);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ code: 'ABCDEFGHJK23' });
  });
  it('preserves unavailable-delivery failures and never retries an offline reset request', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(json({ error: 'Email delivery unavailable.' }, 503));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await expect(repository.requestPasswordReset('user@example.test')).rejects.toThrow('offline');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(repository.requestEmailVerification()).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not send a recovery request after cancellation', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api'), controller = new AbortController();
    controller.abort();
    await expect(repository.requestPasswordReset('user@example.test', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('serializes device writes across account switch and keeps cleanup on the old credential', async () => {
    let release!: (response: Response) => void;
    let signins = 0, registrations = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).endsWith('/sign-in')) {
        signins += 1;
        return json({ ...session, accessToken: signins === 1 ? 'old-session' : 'new-session', profile: { id: signins === 1 ? 'old-user' : 'new-user' } });
      }
      if (String(url).endsWith('/push/devices') && init?.method === 'POST') {
        registrations += 1;
        return registrations === 1 ? new Promise<Response>(resolve => { release = resolve; }) : json({ registered: true });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    const input = { installationId: 'abcdefab-1234-4234-8234-123456789abc', expoPushToken: 'ExpoPushToken[synthetic_device_token]',
      projectId: '12345678-1234-4234-8234-123456789abc', platform: 'android' as const };
    await repository.signIn({ email: 'old@example.test', password: 'test-only' });
    const old = repository.registerPushDevice(input).catch(() => undefined);
    await vi.waitFor(() => expect(registrations).toBe(1));
    await repository.signOut();
    await repository.signIn({ email: 'new@example.test', password: 'test-only' });
    const latest = repository.registerPushDevice(input);
    expect(registrations).toBe(1);
    release(json({ registered: true }));
    await old; await latest;
    const writes = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/push/devices'));
    expect(writes.map(([, init]) => [init?.method, new Headers(init?.headers).get('Authorization')])).toEqual([
      ['POST', 'Bearer old-session'], ['DELETE', 'Bearer old-session'], ['POST', 'Bearer new-session'],
    ]);
  });
  it('sends Gemini consent as false by default and true only when explicitly requested', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => json({ id: 'reply', text: 'Guidance' }));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await repository.askAssistant('General question');
    await repository.askAssistant('General question', true);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ prompt: 'General question', allowExternalAI: false });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ prompt: 'General question', allowExternalAI: true });
  });
  it('unregisters the signed-in device during logout with the original session token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).endsWith('/sign-in')) return json(session);
      if (init?.method === 'POST' && String(url).endsWith('/push/devices')) return json({ registered: true });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await repository.signIn({ email: 'user@example.test', password: 'test-only' });
    await repository.registerPushDevice({ installationId: 'abcdefab-1234-4234-8234-123456789abc',
      expoPushToken: 'ExpoPushToken[synthetic_device_token]', projectId: '12345678-1234-4234-8234-123456789abc', platform: 'android' });
    await repository.signOut();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(call).toBeDefined();
    expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe('Bearer synthetic-token');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ installationId: 'abcdefab-1234-4234-8234-123456789abc' });
  });
  it('does not register notifications after local signout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await expect(repository.registerPushDevice({} as Parameters<typeof repository.registerPushDevice>[0])).rejects.toThrow('Sign in');
  });
  it('lets only the newest sign-in attempt commit its credentials', async () => {
    let release!: (response: Response) => void;
    const newer = { ...session, accessToken: 'newer-token', profile: { id: 'newer-user' } };
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; })).mockImplementation(async () => json(newer));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    const older = repository.signIn({ email: 'old@example.test', password: 'test-only' }).then(() => 'accepted', () => 'cancelled');
    await repository.signIn({ email: 'new@example.test', password: 'test-only' });
    release(json(session));
    expect(await older).toBe('cancelled');
    expect(tokenStore.setMobileApiToken).toHaveBeenCalledExactlyOnceWith('newer-token');
    await repository.loadSnapshot();
    expect(new Headers(fetchMock.mock.calls.at(-1)![1].headers).get('Authorization')).toBe('Bearer newer-token');
  });
  it('does not restore credentials when a secure-store read completes after logout', async () => {
    let release!: (token: string) => void;
    tokenStore.getMobileApiToken.mockReturnValueOnce(new Promise<string>(resolve => { release = resolve; }));
    const fetchMock = vi.fn().mockImplementation(async () => json(session));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    const restoring = repository.restoreSession();
    await repository.signOut();
    release('obsolete-token');
    expect(await restoring).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await repository.loadSnapshot();
    expect(new Headers(fetchMock.mock.calls[0]![1].headers).has('Authorization')).toBe(false);
  });
  it('cannot erase a newer login after an older restore request is denied', async () => {
    let release!: (response: Response) => void;
    let requested!: () => void;
    const started = new Promise<void>(resolve => { requested = resolve; });
    const fetchMock = vi.fn().mockImplementationOnce(() => { requested(); return new Promise<Response>(resolve => { release = resolve; }); }).mockImplementation(async () => json(session));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    const restoring = repository.restoreSession();
    await started;
    await repository.signIn({ email: 'user@example.test', password: 'test-only' });
    release(json({ error: 'expired' }, 401));
    expect(await restoring).toBeNull();
    expect(tokenStore.clearMobileApiToken).not.toHaveBeenCalled();
    await repository.loadSnapshot();
    expect(new Headers(fetchMock.mock.calls[2]![1].headers).get('Authorization')).toBe('Bearer synthetic-token');
  });
  it('serializes token erasure after an already-running credential write', async () => {
    let stored: string | null = null;
    let release!: () => void, writing!: () => void;
    const started = new Promise<void>(resolve => { writing = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    tokenStore.setMobileApiToken.mockImplementation(async (token: string) => { writing(); await wait; stored = token; });
    tokenStore.clearMobileApiToken.mockImplementation(async () => { stored = null; });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(session)).mockResolvedValue(new Response(null, { status: 204 })));
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    const signingIn = repository.signIn({ email: 'user@example.test', password: 'test-only' });
    // Attach a rejection handler before releasing the deliberately delayed write.
    const settled = signingIn.then(() => 'accepted', () => 'cancelled');
    await started;
    const loggingOut = repository.signOut();
    release();
    await loggingOut;
    expect(await settled).toBe('cancelled');
    expect(stored).toBeNull();
  });
  it('does not retain a hidden in-memory login when secure storage fails', async () => {
    tokenStore.setMobileApiToken.mockRejectedValueOnce(new Error('secure storage unavailable'));
    const fetchMock = vi.fn().mockImplementation(async () => json(session));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await expect(repository.signIn({ email: 'user@example.test', password: 'test-only' })).rejects.toThrow('secure storage unavailable');
    await repository.loadSnapshot();
    expect(new Headers(fetchMock.mock.calls.at(-1)![1].headers).has('Authorization')).toBe(false);
  });
  it('retains the saved token on a transient restore failure', async () => {
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
    await expect(new ApiParishLinkRepository('http://localhost:3000/api').restoreSession()).rejects.toThrow('offline');
    expect(tokenStore.clearMobileApiToken).not.toHaveBeenCalled();
  });
  it('removes an actually expired token', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json({error:'expired'},401)));
    expect(await new ApiParishLinkRepository('http://localhost:3000/api').restoreSession()).toBeNull();
    expect(tokenStore.clearMobileApiToken).toHaveBeenCalledOnce();
  });
  it('clears local credentials even if remote logout fails', async () => {
    const fetchMock=vi.fn().mockResolvedValueOnce(json(session)).mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch',fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await repository.restoreSession();
    await expect(repository.signOut()).rejects.toThrow('offline');
    expect(tokenStore.clearMobileApiToken).toHaveBeenCalledOnce();
    fetchMock.mockResolvedValueOnce(json({}));
    await repository.loadSnapshot();
    expect(new Headers(fetchMock.mock.calls[2]![1].headers).has('Authorization')).toBe(false);
  });
  it('reports credential-erasure failure instead of claiming full sign-out', async () => {
    tokenStore.clearMobileApiToken.mockRejectedValueOnce(new Error('secure store unavailable'));
    await expect(new ApiParishLinkRepository('http://localhost:3000/api').signOut()).rejects.toThrow('could not erase');
  });
  it('does not send a pending booking after the account signs out', async () => {
    const fetchMock=vi.fn().mockResolvedValueOnce(json(session)).mockResolvedValueOnce(new Response(null,{status:204}));
    vi.stubGlobal('fetch',fetchMock);
    const repository = new ApiParishLinkRepository('http://localhost:3000/api');
    await repository.restoreSession();
    const rejected=expect(repository.createAppointment({documents:[]} as unknown as CreateAppointmentInput)).rejects.toThrow('account changed');
    await repository.signOut(); await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('reuses the booking key after a lost response, including repository recreation', async () => {
    const input = {serviceId:'baptism',parishId:'metropolitan-cathedral',clergyId:'c1',venueId:'v1',date:'2026-12-01',time:'8:00 AM',durationMinutes:60,bufferBeforeMinutes:15,bufferAfterMinutes:15,documents:[]} as CreateAppointmentInput;
    const saved = {id:'saved',reference:'PL-SAVED',documents:[]};
    const fetchMock=vi.fn().mockResolvedValueOnce(json(session)).mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json(saved));
    vi.stubGlobal('fetch',fetchMock);
    const first = new ApiParishLinkRepository('http://localhost:3000/api');
    await first.restoreSession(); await expect(first.createAppointment(input)).rejects.toThrow('lost response');
    const second = new ApiParishLinkRepository('http://localhost:3000/api');
    await second.restoreSession(); expect(await second.createAppointment(input)).toEqual(saved);
    expect(new Headers(fetchMock.mock.calls[1]![1].headers).get('Idempotency-Key')).toBe(new Headers(fetchMock.mock.calls[3]![1].headers).get('Idempotency-Key'));
  });
});
