import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PushRegistration, pushNotificationId, resolvePushNotification, type PushAdapter, type PushDeviceRegistration, type PushState } from '../src/notifications/pushRegistration';
import type { RepositorySnapshot } from '../src/types/domain';

const projectId = '12345678-1234-4234-8234-123456789abc';
const installationId = 'abcdefab-1234-4234-8234-123456789abc';
let adapter: PushAdapter, register: Mock<(input: PushDeviceRegistration) => Promise<void>>,
  changed: Mock<(state: PushState) => void>, manager: PushRegistration;
beforeEach(() => {
  adapter = {
    availability: vi.fn<PushAdapter['availability']>(() => ({ status: 'available', platform: 'android', projectId })),
    permissions: vi.fn(async () => ({ granted: true, canAskAgain: true })),
    token: vi.fn(async () => 'ExpoPushToken[synthetic_device_token]'),
    installationId: vi.fn(async () => installationId),
    subscribe: vi.fn(async () => () => undefined),
    openSettings: vi.fn(async () => undefined),
  };
  register = vi.fn(async () => undefined);
  changed = vi.fn<(state: PushState) => void>();
  manager = new PushRegistration(adapter, register, changed);
  manager.configure('user:session', true);
});
afterEach(() => vi.useRealTimers());

describe('push permission and registration boundaries', () => {
  it('checks existing permission without opening a permission prompt during automatic synchronization', async () => {
    await manager.synchronize();
    expect(adapter.permissions).toHaveBeenCalledWith(false);
    expect(register).toHaveBeenCalledExactlyOnceWith({ projectId, installationId, platform: 'android', expoPushToken: 'ExpoPushToken[synthetic_device_token]' });
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'registered' }));
  });
  it('forwards an explicit user permission request', async () => {
    await manager.synchronize(true);
    expect(adapter.permissions).toHaveBeenCalledWith(true);
  });
  it.each(['unsupported', 'unconfigured'] as const)('does not touch permissions or device storage when %s', async status => {
    adapter.availability = () => ({ status, message: 'not available' });
    await manager.synchronize(true);
    expect(adapter.permissions).not.toHaveBeenCalled();
    expect(adapter.installationId).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(changed).toHaveBeenLastCalledWith({ status, message: 'not available' });
  });
  it.each([[true, 'permission_required'], [false, 'denied']] as const)('handles denied permission with canAskAgain=%s', async (canAskAgain, status) => {
    adapter.permissions = async () => ({ granted: false, canAskAgain });
    await manager.synchronize();
    expect(register).not.toHaveBeenCalled();
    expect(adapter.token).not.toHaveBeenCalled();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ status }));
  });
  it('does not register disabled accounts', async () => {
    manager.configure('user:session', false);
    await manager.synchronize(true);
    expect(adapter.permissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
  it('cannot register after logout while the native token request is pending', async () => {
    let release!: (token: string) => void;
    adapter.token = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const pending = manager.synchronize();
    await vi.waitFor(() => expect(adapter.token).toHaveBeenCalled());
    manager.invalidate();
    release('ExpoPushToken[synthetic_device_token]');
    await pending;
    expect(register).not.toHaveBeenCalled();
  });
  it('does not register an old account after an account switch during secure storage', async () => {
    let release!: (id: string) => void;
    adapter.installationId = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const pending = manager.synchronize();
    await vi.waitFor(() => expect(adapter.installationId).toHaveBeenCalled());
    manager.configure('other-user:other-session', true);
    release(installationId);
    await pending;
    expect(register).not.toHaveBeenCalled();
    expect(adapter.token).not.toHaveBeenCalled();
  });
  it('does not mark a late server response as registered after signout', async () => {
    let release!: () => void;
    register.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    const pending = manager.synchronize();
    await vi.waitFor(() => expect(register).toHaveBeenCalled());
    manager.invalidate();
    release();
    await pending;
    expect(changed.mock.calls.some(([state]) => state.status === 'registered')).toBe(false);
  });
  it('does not forward malformed Expo tokens or disclose raw provider errors', async () => {
    adapter.token = async () => 'https://evil.invalid/send';
    await manager.synchronize();
    expect(register).not.toHaveBeenCalled();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
  });
  it('offers retry when a native token request stalls and ignores its late completion', async () => {
    vi.useFakeTimers();
    let release!: (value: string) => void;
    adapter.token = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const pending = manager.synchronize();
    await vi.advanceTimersByTimeAsync(25_000);
    await pending;
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error', message: expect.stringContaining('too long') }));
    release('ExpoPushToken[synthetic_device_token]');
    await Promise.resolve();
    expect(register).not.toHaveBeenCalled();
  });
  it('ignores a superseded token lookup after a newer synchronization succeeds', async () => {
    let release!: (value: string) => void;
    adapter.token = vi.fn()
      .mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve; }))
      .mockResolvedValue('ExpoPushToken[newest_device_token]');
    const older = manager.synchronize();
    await vi.waitFor(() => expect(adapter.token).toHaveBeenCalledOnce());
    await manager.synchronize();
    release('ExpoPushToken[older_device_token]');
    await older;
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]?.[0].expoPushToken).toBe('ExpoPushToken[newest_device_token]');
  });
});

describe('push navigation', () => {
  const snapshot = {
    appointments: [{ id: 'appointment-own' }],
    notifications: [
      { id: 'notification-own', target: { kind: 'appointment', appointmentId: 'appointment-own' } },
      { id: 'notification-missing', target: { kind: 'appointment', appointmentId: 'appointment-other' } },
      { id: 'notification-queue', target: { kind: 'queue' } },
    ],
  } as RepositorySnapshot;
  it.each([null, [], {}, { notificationId: 'https://evil.invalid' }, { notificationId: '../secret' }, { notificationId: 123 }])('rejects malformed data %j', data => {
    expect(pushNotificationId(data)).toBeUndefined();
  });
  it('ignores push URLs and targets and uses only the owned server notification', () => {
    const notice = resolvePushNotification({ notificationId: 'notification-own', url: 'https://evil.invalid', entityId: 'appointment-other' }, snapshot);
    expect(notice?.target).toEqual({ kind: 'appointment', appointmentId: 'appointment-own' });
  });
  it('cannot open another account notification or an absent appointment', () => {
    expect(resolvePushNotification({ notificationId: 'foreign-notice' }, snapshot)).toBeUndefined();
    expect(resolvePushNotification({ notificationId: 'notification-missing' }, snapshot)).toBeUndefined();
  });
  it('resolves the backend reminder identifier without interpreting it as a URL or route', () => {
    const id = 'appointment-reminder:appointment-own:2026-11-10T01:00:00.000Z';
    const reminderSnapshot = { ...snapshot, notifications: [{ id, target: { kind: 'appointment' as const, appointmentId: 'appointment-own' } }] } as RepositorySnapshot;
    expect(resolvePushNotification({ notificationId: id }, reminderSnapshot)?.id).toBe(id);
  });
});
