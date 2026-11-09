import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { AuthSession, RepositorySnapshot, Appointment, CreateAppointmentInput } from '../src/types/domain';
const { repository } = vi.hoisted(() => ({ repository: {
  mode: 'api', loadCatalog: vi.fn(), restoreSession: vi.fn(), loadSnapshot: vi.fn(),
  signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), createAppointment: vi.fn(),
  joinQueue: vi.fn(), leaveQueue: vi.fn(), updateProfile: vi.fn(), resetDemo: vi.fn(),
  askAssistant: vi.fn(), searchAvailability: vi.fn(),
  requestPasswordReset: vi.fn(), confirmPasswordReset: vi.fn(), requestEmailVerification: vi.fn(), confirmEmailVerification: vi.fn(),
} }));
vi.mock('../src/repositories/parishLinkRepository', async () => ({
  ...(await import('../src/api/appointmentSubmission')),
  createParishLinkRepository: () => repository,
}));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) } }));
import { MobileApiError } from '../src/api/mobileApiClient';
import { useParishLink } from '../src/hooks/useParishLink';

const profile = { id: 'user-one', displayName: 'Synthetic User', email: 'user@example.test', mobileNumber: '+639170000000', homeParishId: 'metropolitan-cathedral' as const, notificationsEnabled: true };
const session: AuthSession = { mode:'api', profile };
const snapshot: RepositorySnapshot = { source: 'api', profile, appointments: [], notifications: [] };
let hook: ReturnType<typeof useParishLink>, renderer: ReactTestRenderer;
function Harness() { hook = useParishLink(); return null; }
async function mount() { await act(async () => { renderer = create(React.createElement(Harness)); }); }
function deferred<T>() { let resolve!: (value:T) => void; const promise = new Promise<T>(r => { resolve=r; }); return { promise, resolve }; }
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  repository.loadCatalog.mockResolvedValue({});
  repository.restoreSession.mockResolvedValue(session);
  repository.loadSnapshot.mockResolvedValue(snapshot);
  repository.signIn.mockResolvedValue(session);
  repository.signOut.mockResolvedValue(undefined);
  repository.requestPasswordReset.mockResolvedValue(undefined); repository.confirmPasswordReset.mockResolvedValue(undefined);
  repository.requestEmailVerification.mockResolvedValue(undefined); repository.confirmEmailVerification.mockResolvedValue(undefined);
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
describe('mobile session and network recovery', () => {
  it.each(['request', 'confirm'])('clears an expired session during verification %s', async operation => {
    await mount();
    repository.requestEmailVerification.mockRejectedValueOnce(new MobileApiError('expired', 401));
    repository.confirmEmailVerification.mockRejectedValueOnce(new MobileApiError('expired', 401));
    await act(async () => {
      await expect(operation === 'request' ? hook.requestEmailVerification() : hook.confirmEmailVerification('ABCDEFGHJK23')).rejects.toThrow('expired');
    });
    expect(hook.session).toBeUndefined(); expect(hook.snapshot).toBeUndefined();
  });
  it('marks an email verified only after server confirmation and ignores an older unverified snapshot', async () => {
    await mount(); const older = deferred<RepositorySnapshot>();
    repository.loadSnapshot.mockReturnValueOnce(older.promise);
    let pending!: Promise<RepositorySnapshot>;
    await act(async () => { pending = hook.refresh(); });
    await act(async () => { await hook.confirmEmailVerification('ABCDEFGHJK23'); });
    expect(hook.session?.profile.emailVerified).toBe(true);
    await act(async () => { older.resolve(snapshot); await pending; });
    expect(hook.snapshot?.profile.emailVerified).toBe(true);
  });
  it('does not mark invalid verification codes as verified', async () => {
    await mount(); repository.confirmEmailVerification.mockRejectedValueOnce(new MobileApiError('Invalid or expired code.', 400));
    await act(async () => { await expect(hook.confirmEmailVerification('ABCDEFGHJK23')).rejects.toThrow('Invalid'); });
    expect(hook.session?.profile.emailVerified).not.toBe(true);
    expect(hook.snapshot?.profile.emailVerified).not.toBe(true);
  });
  it('does not restore verified state after logout while confirmation is pending', async () => {
    await mount(); const result = deferred<void>();
    repository.confirmEmailVerification.mockReturnValueOnce(result.promise);
    let pending!: Promise<unknown>;
    await act(async () => { pending = hook.confirmEmailVerification('ABCDEFGHJK23').catch(error => error); });
    await act(async () => { await hook.signOut(); result.resolve(); await pending; });
    expect(hook.session).toBeUndefined(); expect(hook.snapshot).toBeUndefined();
  });
  it('clears the current account after a confirmed password reset without automatically signing in', async () => {
    await mount();
    await act(async () => { await hook.confirmPasswordReset({ email: profile.email, code: 'ABCDEFGHJK23', newPassword: 'SyntheticPassword7', confirmPassword: 'SyntheticPassword7' }); });
    expect(hook.session).toBeUndefined(); expect(hook.snapshot).toBeUndefined();
    expect(repository.signIn).not.toHaveBeenCalled();
  });
  it('does not display a cancelled verification as an authentication error', async () => {
    await mount(); repository.requestEmailVerification.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    await act(async () => { await expect(hook.requestEmailVerification()).rejects.toMatchObject({ name: 'AbortError' }); });
    expect(hook.session?.profile.id).toBe(profile.id); expect(hook.error).toBe(''); expect(hook.loading).toBe(false);
  });
  it.each(['assistant', 'availability'])('clears an expired session during %s requests', async operation => {
    await mount();
    repository.askAssistant.mockRejectedValueOnce(new MobileApiError('expired', 401));
    repository.searchAvailability.mockRejectedValueOnce(new MobileApiError('expired', 401));
    await act(async () => {
      const pending = operation === 'assistant' ? hook.askAssistant('Test') : hook.searchAvailability({} as Parameters<typeof hook.searchAvailability>[0]);
      await expect(pending).rejects.toThrow('expired');
    });
    expect(hook.session).toBeUndefined();
    expect(hook.snapshot).toBeUndefined();
    expect(hook.loading).toBe(false);
  });
  it('ignores an older refresh that finishes after a newer refresh', async () => {
    await mount();
    const older = deferred<RepositorySnapshot>();
    repository.loadSnapshot.mockReturnValueOnce(older.promise);
    let pending!: Promise<RepositorySnapshot>;
    await act(async () => { pending = hook.refresh(); });
    const newest = { ...snapshot, appointments: [{ id: 'newer' } as Appointment] };
    repository.loadSnapshot.mockResolvedValueOnce(newest);
    await act(async () => { await hook.refresh(); });
    await act(async () => { older.resolve(snapshot); await pending; });
    expect(hook.snapshot).toEqual(newest);
  });
  it('keeps a confirmed saved appointment when an older read arrives during its follow-up refresh', async () => {
    await mount();
    const older = deferred<RepositorySnapshot>(), afterSave = deferred<RepositorySnapshot>();
    repository.loadSnapshot.mockReturnValueOnce(older.promise).mockReturnValueOnce(afterSave.promise);
    let oldRead!: Promise<RepositorySnapshot>, save!: Promise<Appointment>;
    await act(async () => { oldRead = hook.refresh(); });
    const appointment = { id: 'saved' } as Appointment;
    repository.createAppointment.mockResolvedValue(appointment);
    await act(async () => { save = hook.createAppointment({} as CreateAppointmentInput); });
    await act(async () => { older.resolve(snapshot); await oldRead; });
    expect(hook.snapshot?.appointments).toContainEqual(appointment);
    expect(hook.loading).toBe(true);
    await act(async () => { afterSave.resolve({ ...snapshot, appointments: [appointment] }); await save; });
    expect(hook.loading).toBe(false);
  });
  it('clears private state immediately even if offline logout fails', async () => {
    await mount();
    repository.signOut.mockRejectedValue(new Error('offline'));
    await act(async () => { await hook.signOut(); });
    expect(hook.session).toBeUndefined(); expect(hook.snapshot).toBeUndefined();
    expect(hook.error).toContain('Signed out on this device');
  });
  it('does not restore a private snapshot that arrives after logout', async () => {
    await mount();
    const response = deferred<RepositorySnapshot>();
    repository.loadSnapshot.mockReturnValue(response.promise);
    let pending!: Promise<RepositorySnapshot>;
    await act(async () => { pending = hook.refresh(); });
    await act(async () => { await hook.signOut(); response.resolve(snapshot); await pending; });
    expect(hook.session).toBeUndefined(); expect(hook.snapshot).toBeUndefined();
  });
  it('exposes recoverable startup errors without pretending the session was invalid', async () => {
    repository.restoreSession.mockRejectedValue(new Error('network offline'));
    await mount();
    expect(hook.initializing).toBe(false); expect(hook.initializationError).toBe(true);
    expect(repository.signOut).not.toHaveBeenCalled();
    repository.restoreSession.mockResolvedValue(session);
    await act(async () => { hook.retryInitialization(); });
    expect(hook.snapshot).toEqual(snapshot); expect(hook.initializationError).toBe(false);
  });
  it('retains sign-in and allows dashboard retry when snapshot loading fails', async () => {
    repository.restoreSession.mockResolvedValue(null);
    await mount();
    repository.loadSnapshot.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await expect(hook.signIn({email:profile.email,password:'not-used'})).rejects.toThrow('offline'); });
    expect(hook.session).toEqual(session); expect(hook.snapshot).toBeUndefined(); expect(hook.loading).toBe(false);
    await act(async () => { await hook.refresh(); });
    expect(hook.snapshot).toEqual(snapshot);
  });
  it('treats saved writes as success when only the refresh fails', async () => {
    await mount();
    const appointment = { id:'saved', reference:'PL-SAVED' } as Appointment;
    repository.createAppointment.mockResolvedValue(appointment);
    repository.loadSnapshot.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { expect(await hook.createAppointment({} as CreateAppointmentInput)).toEqual(appointment); });
    expect(hook.snapshot?.appointments).toContainEqual(appointment);
    expect(hook.warning).toContain('was saved');
    expect(repository.createAppointment).toHaveBeenCalledOnce();
  });
  it('clears expired sessions when refresh returns 401', async () => {
    await mount();
    repository.loadSnapshot.mockRejectedValueOnce(new MobileApiError('expired',401));
    await act(async () => { await expect(hook.refresh()).rejects.toThrow('expired'); });
    expect(hook.session).toBeUndefined(); expect(hook.snapshot).toBeUndefined(); expect(hook.loading).toBe(false);
  });
});
