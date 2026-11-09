import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession, RepositorySnapshot } from '../src/types/domain';
import type { ParishLinkRepository } from '../src/repositories/parishLinkRepository';
const { callbacks, adapter } = vi.hoisted(() => ({
  callbacks: { tapped: undefined as undefined | ((data: unknown) => void) },
  adapter: {
    availability: () => ({ status: 'available', platform: 'android', projectId: '12345678-1234-4234-8234-123456789abc' }),
    permissions: async () => ({ granted: true, canAskAgain: true }),
    token: async () => 'ExpoPushToken[synthetic_device_token]',
    installationId: async () => 'abcdefab-1234-4234-8234-123456789abc',
    subscribe: vi.fn(), openSettings: async () => undefined,
  },
}));
vi.mock('../src/notifications/pushAdapter', () => ({ pushAdapter: adapter }));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: vi.fn() }) } }));
import { usePushNotifications } from '../src/hooks/usePushNotifications';

const profile = { id: 'user-a', displayName: 'Synthetic', email: 'a@example.test', mobileNumber: '', homeParishId: 'san-guillermo' as const, notificationsEnabled: true };
const session: AuthSession = { mode: 'api', profile };
const snapshot: RepositorySnapshot = { source: 'api', profile, appointments: [], notifications: [{ id: 'notice-a', title: 'Update', body: 'Update', createdAt: '', target: { kind: 'queue' } }] };
const repository = { mode: 'api', registerPushDevice: vi.fn(async () => undefined) } as unknown as ParishLinkRepository;
let result: ReturnType<typeof usePushNotifications>, renderer: ReactTestRenderer | undefined;
function Harness({ session: value, refresh }: { session: AuthSession | undefined; refresh: () => Promise<RepositorySnapshot> }) {
  result = usePushNotifications(repository, value, refresh); return null;
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  callbacks.tapped = undefined;
  adapter.subscribe.mockImplementation(async (_receive: () => void, tap: (data: unknown) => void) => { callbacks.tapped = tap; return () => undefined; });
});
afterEach(async () => { if (renderer) await act(async () => renderer?.unmount()); renderer = undefined; });

describe('push tap session lifecycle', () => {
  it('refreshes authenticated data before exposing a valid tap for navigation', async () => {
    const refresh = vi.fn(async () => snapshot);
    await act(async () => { renderer = create(React.createElement(Harness, { session, refresh })); });
    await act(async () => callbacks.tapped?.({ notificationId: 'notice-a', url: 'https://evil.invalid' }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.opened?.id).toBe('notice-a');
  });
  it('drops a pending tap when the account changes before its refreshed snapshot arrives', async () => {
    let release!: (value: RepositorySnapshot) => void;
    const refresh = vi.fn(() => new Promise<RepositorySnapshot>(resolve => { release = resolve; }));
    await act(async () => { renderer = create(React.createElement(Harness, { session, refresh })); });
    await act(async () => callbacks.tapped?.({ notificationId: 'notice-a' }));
    const other: AuthSession = { ...session, profile: { ...profile, id: 'user-b' } };
    await act(async () => renderer?.update(React.createElement(Harness, { session: other, refresh })));
    await act(async () => { release(snapshot); });
    expect(result.opened).toBeUndefined();
  });
  it('does not fetch or navigate for malformed push data', async () => {
    const refresh = vi.fn(async () => snapshot);
    await act(async () => { renderer = create(React.createElement(Harness, { session, refresh })); });
    await act(async () => callbacks.tapped?.({ url: 'https://evil.invalid', notificationId: '../private' }));
    expect(refresh).not.toHaveBeenCalled();
    expect(result.opened).toBeUndefined();
  });
  it('does not navigate to a signed-out account notification after another user logs in', async () => {
    const otherSnapshot = { ...snapshot, profile: { ...profile, id: 'user-b' }, notifications: [] };
    const refresh = vi.fn(async () => otherSnapshot);
    await act(async () => { renderer = create(React.createElement(Harness, { session: undefined, refresh })); });
    await act(async () => callbacks.tapped?.({ notificationId: 'notice-a' }));
    expect(refresh).not.toHaveBeenCalled();
    const other: AuthSession = { ...session, profile: otherSnapshot.profile };
    await act(async () => renderer?.update(React.createElement(Harness, { session: other, refresh })));
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.opened).toBeUndefined();
  });
});
