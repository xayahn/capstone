import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ParishLinkRepository } from '../repositories/parishLinkRepository';
import type { AppNotification, AuthSession, RepositorySnapshot } from '../types/domain';
import { pushAdapter } from '../notifications/pushAdapter';
import { PushRegistration, pushNotificationId, resolvePushNotification, type PushState } from '../notifications/pushRegistration';

export function usePushNotifications(repository: ParishLinkRepository, session: AuthSession | undefined,
  refresh: () => Promise<RepositorySnapshot>) {
  const [state, setState] = useState<PushState>({ status: 'disabled', message: 'Sign in to manage push alerts.' });
  const [opened, setOpened] = useState<AppNotification>();
  const context = useRef({ session, version: 0 });
  const pendingTap = useRef<unknown>(undefined);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const manager = useMemo(() => new PushRegistration(pushAdapter, async input => {
    if (!repository.registerPushDevice) throw new Error('Push registration is unavailable');
    await repository.registerPushDevice(input);
  }, setState), [repository]);

  const processTap = useCallback(async (data: unknown) => {
    if (!pushNotificationId(data)) return;
    if (context.current.session?.mode !== 'api') { pendingTap.current = data; return; }
    const version = context.current.version;
    pendingTap.current = undefined;
    try {
      const snapshot = await refreshRef.current();
      if (context.current.version !== version || context.current.session?.mode !== 'api') return;
      const notification = resolvePushNotification(data, snapshot);
      if (notification) setOpened(notification);
    } catch {
      // The notification tray is never a source of private business data. Retry
      // from the authenticated in-app notifications list after reconnecting.
    }
  }, []);

  useEffect(() => {
    context.current = { session, version: context.current.version + 1 };
    setOpened(undefined);
    const key = session?.mode === 'api' ? session.profile.id + ':' + (session.accessToken ?? 'restored') : undefined;
    manager.configure(key, Boolean(session?.profile.notificationsEnabled));
    if (key) {
      void manager.synchronize();
      if (pendingTap.current) void processTap(pendingTap.current);
    }
    return () => { context.current.version += 1; manager.invalidate(); };
  }, [manager, processTap, session?.mode, session?.profile.id, session?.accessToken, session?.profile.notificationsEnabled]);

  useEffect(() => {
    let disposed = false;
    let remove: () => void = () => undefined;
    const update = () => {
      if (!manager.enabled()) return;
      void manager.synchronize();
      void refreshRef.current().catch(() => undefined);
    };
    void pushAdapter.subscribe(update, data => { if (!disposed) void processTap(data); }, () => !disposed && manager.enabled())
      .then(cleanup => { if (disposed) cleanup(); else remove = cleanup; })
      .catch(() => { if (!disposed && manager.enabled()) setState({ status: 'error', message: 'Device notification listeners are unavailable. In-app updates still work.' }); });
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active' && manager.enabled()) void manager.synchronize();
    });
    return () => { disposed = true; remove(); listener.remove(); };
  }, [manager, processTap]);

  const invalidate = useCallback(() => {
    context.current = { session: undefined, version: context.current.version + 1 };
    pendingTap.current = undefined;
    manager.invalidate();
    setOpened(undefined);
    setState({ status: 'disabled', message: 'Push alerts are inactive on this signed-out device.' });
  }, [manager]);

  return {
    state, opened, invalidate,
    enable: () => manager.synchronize(true),
    retry: () => manager.synchronize(false),
    openSettings: () => pushAdapter.openSettings().catch(() => {
      setState({ status: 'error', message: 'Open your device settings and allow ParishLink notifications, then try again.' });
    }),
  };
}
