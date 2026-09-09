import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppointmentCreatedWithUploadError,
  createParishLinkRepository,
  type ParishLinkRepository,
} from '../repositories/parishLinkRepository';
import type {
  Appointment,
  AssistantMessage,
  AuthSession,
  AvailabilitySearchInput,
  ChangePasswordInput,
  CreateAppointmentInput,
  ParishId,
  ParishionerProfile,
  QueueService,
  RepositorySnapshot,
  SignInInput,
  SignUpInput,
  UploadAppointmentDocumentInput,
} from '../types/domain';

export const useParishLink = () => {
  const repository = useMemo<ParishLinkRepository>(
    () => createParishLinkRepository(),
    [],
  );
  const [session, setSession] = useState<AuthSession>();
  const [snapshot, setSnapshot] = useState<RepositorySnapshot>();
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setError('');
    setWarning('');
    setLoading(true);
    try {
      return await operation();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';
      setError(message);
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await repository.loadSnapshot();
    setSnapshot(next);
    return next;
  }, [repository]);

  const mergeAppointment = useCallback((appointment: Appointment) => {
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
    void repository.loadCatalog()
      .then(() => repository.restoreSession())
      .then(async (restored) => {
        if (!active || !restored) return;
        const next = await repository.loadSnapshot();
        if (!active) return;
        setSession(restored);
        setSnapshot(next);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Your saved session could not be restored.');
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => { active = false; };
  }, [repository]);

  const signIn = useCallback(
    (input: SignInInput) =>
      run(async () => {
        const nextSession = await repository.signIn(input);
        setSession(nextSession);
        await refresh();
      }),
    [refresh, repository, run],
  );

  const createAppointment = useCallback(
    (input: CreateAppointmentInput) =>
      run(async () => {
        try {
          const appointment = await repository.createAppointment(input);
          mergeAppointment(appointment);
          await refresh();
          return appointment;
        } catch (cause) {
          if (!(cause instanceof AppointmentCreatedWithUploadError)) throw cause;
          mergeAppointment(cause.appointment);
          try {
            await refresh();
          } catch {
            // The server-created request is still retained locally for this session.
          }
          setWarning(cause.message);
          return cause.appointment;
        }
      }),
    [mergeAppointment, refresh, repository, run],
  );

  const searchAvailability = useCallback(
    (input: AvailabilitySearchInput) => repository.searchAvailability(input),
    [repository],
  );

  const uploadAppointmentDocument = useCallback(
    (appointmentId: string, documentId: string, input: UploadAppointmentDocumentInput) =>
      run(async () => {
        const appointment = await repository.uploadAppointmentDocument(appointmentId, documentId, input);
        mergeAppointment(appointment);
        await refresh();
        return appointment;
      }),
    [mergeAppointment, refresh, repository, run],
  );

  const signUp = useCallback(
    (input: SignUpInput) =>
      run(async () => {
        const nextSession = await repository.signUp(input);
        setSession(nextSession);
        await refresh();
      }),
    [refresh, repository, run],
  );

  const markNotificationRead = useCallback(
    async (id: string) => {
      await repository.markNotificationRead(id);
      await refresh();
    },
    [refresh, repository],
  );

  const joinQueue = useCallback(
    (parishId: ParishId, service: QueueService) =>
      run(async () => {
        const ticket = await repository.joinQueue(parishId, service);
        await refresh();
        return ticket;
      }),
    [refresh, repository, run],
  );

  const leaveQueue = useCallback(
    () =>
      run(async () => {
        await repository.leaveQueue();
        await refresh();
      }),
    [refresh, repository, run],
  );

  const askAssistant = useCallback(
    (prompt: string): Promise<AssistantMessage> => repository.askAssistant(prompt),
    [repository],
  );

  const updateProfile = useCallback(
    (profile: ParishionerProfile) =>
      run(async () => {
        const updated = await repository.updateProfile(profile);
        setSession((current) => (current ? { ...current, profile: updated } : current));
        await refresh();
      }),
    [refresh, repository, run],
  );

  const changePassword = useCallback(
    (input: ChangePasswordInput) => run(() => repository.changePassword(input)),
    [repository, run],
  );

  const resetDemo = useCallback(
    () =>
      run(async () => {
        await repository.resetDemo?.();
        const next = await repository.loadSnapshot();
        setSnapshot(next);
        setSession({ mode: 'demo', profile: next.profile });
      }),
    [repository, run],
  );

  return {
    repositoryMode: repository.mode,
    initializing,
    session,
    snapshot,
    loading,
    error,
    warning,
    clearError: () => setError(''),
    clearWarning: () => setWarning(''),
    signIn,
    signUp,
    signOut: () => run(async () => {
      await repository.signOut();
      setSession(undefined);
      setSnapshot(undefined);
      setError('');
    }),
    refresh: () => run(refresh),
    searchAvailability,
    createAppointment,
    uploadAppointmentDocument,
    markNotificationRead,
    joinQueue,
    leaveQueue,
    askAssistant,
    updateProfile,
    changePassword,
    resetDemo,
  };
};
