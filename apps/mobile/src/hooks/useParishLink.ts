import { AppState } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppointmentCreatedWithUploadError,
  createParishLinkRepository,
  type ParishLinkRepository,
} from '../repositories/parishLinkRepository';
import { LocalSignOutError } from '../api/sessionErrors';
import { MobileApiError } from '../api/mobileApiClient';
import { usePushNotifications } from './usePushNotifications';
import type {
  Appointment,
  AssistantMessage,
  AuthSession,
  AvailabilitySearchInput,
  ChangePasswordInput,
  CreateAppointmentInput,
  ParishId,
  ParishionerProfile,
  PasswordResetInput,
  QueueService,
  RepositorySnapshot,
  RescheduleInput,
  SignInInput,
  SignUpInput,
  UploadAppointmentDocumentInput,
} from '../types/domain';

export const useParishLink = () => {
  const repository = useMemo<ParishLinkRepository>(
    () => createParishLinkRepository(),
    [],
  );
  const generation = useRef(0);
  const readGeneration = useRef(0);
  const pendingOperations = useRef(0);
  const activeUser = useRef(false);
  const invalidatePush = useRef<() => void>(() => undefined);
  const [initializationError, setInitializationError] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [session, setSession] = useState<AuthSession>();
  const currentSession = useRef(session);
  currentSession.current = session;
  const [snapshot, setSnapshot] = useState<RepositorySnapshot>();
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const run = useCallback(async <T,>(operation: (isCurrent: () => boolean) => Promise<T>) => {
    const startedGeneration = generation.current;
    const isCurrent = () => startedGeneration === generation.current;
    setError('');
    setWarning('');
    setLoading(true);
    pendingOperations.current += 1;
    try {
      return await operation(isCurrent);
    } catch (cause) {
      if (!isCurrent()) throw cause;
      const message = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';
      if (cause instanceof Error && cause.name === 'AbortError') throw cause;
      if (cause instanceof MobileApiError && cause.status === 401 && activeUser.current) {
        invalidatePush.current();
        generation.current += 1;
        readGeneration.current += 1;
        pendingOperations.current = 0;
        activeUser.current = false;
        setSession(undefined);
        setSnapshot(undefined);
        setLoading(false);
        void repository.signOut().catch(() => undefined);
      }
      setError(message);
      throw cause;
    } finally {
      if (isCurrent()) {
        pendingOperations.current -= 1;
        setLoading(pendingOperations.current > 0);
      }
    }
  }, [repository]);

  const refresh = useCallback(async () => {
    const requestGeneration = generation.current;
    const read = ++readGeneration.current;
    try {
      const next = await repository.loadSnapshot();
      if (requestGeneration === generation.current && read === readGeneration.current && activeUser.current) setSnapshot(next);
      return next;
    } catch (cause) {
      if (requestGeneration === generation.current && cause instanceof MobileApiError && cause.status === 401) {
        invalidatePush.current();
        generation.current += 1;
        readGeneration.current += 1;
        pendingOperations.current = 0;
        activeUser.current = false;
        setSession(undefined);
        setSnapshot(undefined);
        setLoading(false);
        setError('Your session has expired. Sign in again.');
        void repository.signOut().catch(() => undefined);
      }
      throw cause;
    }
  }, [repository]);

  const push = usePushNotifications(repository, session, refresh);
  invalidatePush.current = push.invalidate;

  const refreshAfterSave = useCallback(async () => {
    const startedGeneration = generation.current;
    try { await refresh(); }
    catch {
      if (startedGeneration !== generation.current) return;
      setWarning('Your change was saved, but the latest dashboard could not load. Refresh when your connection returns; do not submit again.');
    }
  }, [refresh]);

  const mergeAppointment = useCallback((appointment: Appointment) => {
    readGeneration.current += 1;
    setSnapshot((current) => {
      if (!current) return current;
      const exists = current.appointments.some((item) => item.id === appointment.id);
      return {
        ...current,
        appointments: exists
          ? current.appointments.map((item) => item.id === appointment.id ? appointment : item)
          : [appointment, ...current.appointments],
      };
    });
  }, []);

  useEffect(() => {
    let active = true;
    const startedGeneration = generation.current;
    setInitializing(true);
    setInitializationError(false);
    void repository.loadCatalog()
      .then(() => repository.restoreSession())
      .then(async (restored) => {
        if (!active || !restored || startedGeneration !== generation.current) return;
        activeUser.current = true;
        setSession(restored);
        await refresh();
      })
      .catch((cause) => {
        if (active && startedGeneration === generation.current) { setInitializationError(true); setError(cause instanceof Error ? cause.message : 'Your saved session could not be restored.'); }
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => { active = false; };
  }, [repository, refresh, bootAttempt]);

  const canRefreshInBackground = Boolean(session && snapshot) && !loading;
  useEffect(() => {
    if (!canRefreshInBackground) return;
    let cancelled = false, refreshing = false;
    const update = async () => {
      if (cancelled || refreshing || AppState.currentState !== 'active') return;
      refreshing = true;
      try { await refresh(); }
      catch {
        if (!cancelled && activeUser.current) setWarning('Updates are temporarily unavailable. Reconnect and refresh for the latest queue and request status.');
      } finally { refreshing = false; }
    };
    const timer = setInterval(() => { void update(); }, 30_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void update(); });
    return () => { cancelled = true; clearInterval(timer); listener.remove(); };
  }, [canRefreshInBackground, refresh]);

  const signIn = useCallback(
    (input: SignInInput) =>
      run(async (isCurrent) => {
        const nextSession = await repository.signIn(input);
        if (!isCurrent()) return;
        activeUser.current = true;
        setInitializationError(false);
        setSession(nextSession);
        await refresh();
      }),
    [refresh, repository, run],
  );

  const createAppointment = useCallback(
    (input: CreateAppointmentInput) =>
      run(async (isCurrent) => {
        try {
          const appointment = await repository.createAppointment(input);
          if (!isCurrent()) return appointment;
          mergeAppointment(appointment);
          await refreshAfterSave();
          return appointment;
        } catch (cause) {
          if (!(cause instanceof AppointmentCreatedWithUploadError)) throw cause;
          if (!isCurrent()) return cause.appointment;
          mergeAppointment(cause.appointment);
          try {
            await refresh();
          } catch {
            // The server-created request is still retained locally for this session.
          }
          if (isCurrent()) setWarning(cause.message);
          return cause.appointment;
        }
      }),
    [mergeAppointment, refresh, refreshAfterSave, repository, run],
  );

  const searchAvailability = useCallback(
    (input: AvailabilitySearchInput) => run(() => repository.searchAvailability(input)),
    [repository, run],
  );

  const uploadAppointmentDocument = useCallback(
    (appointmentId: string, documentId: string, input: UploadAppointmentDocumentInput) =>
      run(async (isCurrent) => {
        const appointment = await repository.uploadAppointmentDocument(appointmentId, documentId, input);
        if (!isCurrent()) return appointment;
        mergeAppointment(appointment);
        await refreshAfterSave();
        return appointment;
      }),
    [mergeAppointment, refresh, refreshAfterSave, repository, run],
  );

  /** Shared wrapper for cancel/reschedule/withdraw: merge the returned appointment, then refresh. */
  const changeAppointment = useCallback(
    (operation: () => Promise<Appointment>) =>
      run(async (isCurrent) => {
        const appointment = await operation();
        if (!isCurrent()) return appointment;
        mergeAppointment(appointment);
        await refreshAfterSave();
        return appointment;
      }),
    [mergeAppointment, refreshAfterSave, run],
  );

  const cancelAppointment = useCallback(
    (appointmentId: string, reason: string) => changeAppointment(() => repository.cancelAppointment(appointmentId, reason)),
    [changeAppointment, repository],
  );

  const requestReschedule = useCallback(
    (appointmentId: string, input: RescheduleInput) => changeAppointment(() => repository.requestReschedule(appointmentId, input)),
    [changeAppointment, repository],
  );

  const withdrawChangeRequest = useCallback(
    (appointmentId: string) => changeAppointment(() => repository.withdrawChangeRequest(appointmentId)),
    [changeAppointment, repository],
  );

  const signUp = useCallback(
    (input: SignUpInput) =>
      run(async (isCurrent) => {
        const nextSession = await repository.signUp(input);
        if (!isCurrent()) return;
        activeUser.current = true;
        setInitializationError(false);
        setSession(nextSession);
        await refresh();
      }),
    [refresh, refreshAfterSave, repository, run],
  );

  const markNotificationRead = useCallback(
    (id: string) => run(async isCurrent => {
      await repository.markNotificationRead(id);
      if (!isCurrent()) return;
      setSnapshot(current => current ? { ...current, notifications: current.notifications.map(item =>
        item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item) } : current);
      await refreshAfterSave();
    }),
    [refreshAfterSave, repository, run],
  );

  const joinQueue = useCallback(
    (parishId: ParishId, service: QueueService) =>
      run(async (isCurrent) => {
        const ticket = await repository.joinQueue(parishId, service);
        if (!isCurrent()) return ticket;
        setSnapshot(current => current ? { ...current, activeQueueTicket: ticket } : current);
        await refreshAfterSave();
        return ticket;
      }),
    [refresh, refreshAfterSave, repository, run],
  );

  const leaveQueue = useCallback(
    () =>
      run(async (isCurrent) => {
        await repository.leaveQueue();
        if (!isCurrent()) return;
        setSnapshot(current => {
          if (!current) return current;
          const { activeQueueTicket: _ticket, ...rest } = current;
          return rest;
        });
        await refreshAfterSave();
      }),
    [refresh, refreshAfterSave, repository, run],
  );

  const askAssistant = useCallback(
    (prompt: string, allowExternalAI = false): Promise<AssistantMessage> => run(() => repository.askAssistant(prompt, allowExternalAI)),
    [repository, run],
  );

  const updateProfile = useCallback(
    (profile: ParishionerProfile) =>
      run(async (isCurrent) => {
        const updated = await repository.updateProfile(profile);
        if (!isCurrent()) return;
        setSession((current) => (current ? { ...current, profile: updated } : current));
        setSnapshot(current => current ? { ...current, profile: updated } : current);
        await refreshAfterSave();
      }),
    [refreshAfterSave, repository, run],
  );

  const changePassword = useCallback(
    (input: ChangePasswordInput) => run(() => repository.changePassword(input)),
    [repository, run],
  );

  const requestPasswordReset = useCallback((email: string, signal?: AbortSignal) => {
    if (repository.mode !== 'api' || !repository.requestPasswordReset) {
      return Promise.reject(new Error('Email recovery is unavailable in the local demonstration.'));
    }
    return repository.requestPasswordReset(email, signal);
  }, [repository]);

  const confirmPasswordReset = useCallback(async (input: PasswordResetInput, signal?: AbortSignal) => {
    if (repository.mode !== 'api' || !repository.confirmPasswordReset) throw new Error('Email recovery is unavailable in the local demonstration.');
    const started = generation.current, initial = currentSession.current;
    await repository.confirmPasswordReset(input, signal);
    const current = currentSession.current;
    if (started !== generation.current || initial?.profile.id !== current?.profile.id || initial?.accessToken !== current?.accessToken) return;
    if (initial) {
      push.invalidate(); generation.current += 1; readGeneration.current += 1;
      pendingOperations.current = 0; activeUser.current = false;
      setSession(undefined); setSnapshot(undefined); setLoading(false);
    }
    setError(''); setWarning('');
  }, [repository, push.invalidate]);

  const requestEmailVerification = useCallback((signal?: AbortSignal) => run(async () => {
    if (repository.mode !== 'api' || !repository.requestEmailVerification) throw new Error('Email verification is unavailable in the local demonstration.');
    await repository.requestEmailVerification(signal);
  }), [repository, run]);

  const confirmEmailVerification = useCallback((code: string, signal?: AbortSignal) => run(async isCurrent => {
    if (repository.mode !== 'api' || !repository.confirmEmailVerification) throw new Error('Email verification is unavailable in the local demonstration.');
    const initial = currentSession.current;
    await repository.confirmEmailVerification(code, signal);
    if (!isCurrent() || initial?.profile.id !== currentSession.current?.profile.id
      || initial?.accessToken !== currentSession.current?.accessToken) throw new DOMException('Verification was cancelled.', 'AbortError');
    readGeneration.current += 1;
    setSession(value => value ? { ...value, profile: { ...value.profile, emailVerified: true } } : value);
    setSnapshot(value => value ? { ...value, profile: { ...value.profile, emailVerified: true } } : value);
  }), [repository, run]);

  const resetDemo = useCallback(
    () =>
      run(async (isCurrent) => {
        await repository.resetDemo?.();
        const next = await repository.loadSnapshot();
        if (!isCurrent()) return;
        setSnapshot(next);
        setSession({ mode: 'demo', profile: next.profile });
      }),
    [repository, run],
  );

  return {
    repositoryMode: repository.mode,
    initializing,
    initializationError,
    retryInitialization: () => setBootAttempt(value => value + 1),
    session,
    snapshot,
    loading,
    error,
    warning,
    pushState: push.state,
    enablePush: push.enable,
    retryPush: push.retry,
    openNotificationSettings: push.openSettings,
    openedPushNotification: push.opened,
    clearError: () => setError(''),
    clearWarning: () => setWarning(''),
    signIn,
    signUp,
    signOut: async () => {
      push.invalidate();
      generation.current += 1;
      readGeneration.current += 1;
      pendingOperations.current = 0;
      activeUser.current = false;
      setSession(undefined);
      setSnapshot(undefined);
      setInitializationError(false);
      setLoading(false);
      setError('');
      setWarning('');
      try { await repository.signOut(); }
      catch (cause) { setError(cause instanceof LocalSignOutError ? cause.message : 'Signed out on this device. The server could not confirm revocation; change your password after reconnecting to revoke other sessions.'); }
    },
    refresh: () => run(refresh),
    searchAvailability,
    createAppointment,
    uploadAppointmentDocument,
    cancelAppointment,
    requestReschedule,
    withdrawChangeRequest,
    markNotificationRead,
    joinQueue,
    leaveQueue,
    askAssistant,
    updateProfile,
    changePassword,
    requestPasswordReset,
    confirmPasswordReset,
    requestEmailVerification,
    confirmEmailVerification,
    resetDemo,
  };
};
