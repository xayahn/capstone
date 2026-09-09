import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import {
  submitAppointmentWithDocuments,
} from '../api/appointmentSubmission';
import { MobileApiClient } from '../api/mobileApiClient';
import { clearMobileApiToken, getMobileApiToken, setMobileApiToken } from '../api/tokenStore';
import { apiBaseUrl, demoMode } from '../config/environment';
import { PARISHES, QUEUE_SERVICES, SACRAMENT_SERVICES, applyCatalog } from '../data/catalog';
import { getDemoGuidance } from '../lib/assistant';
import { assertAcceptablePassword, isEmailAddress, normalizeEmail } from '../lib/auth';
import { getBookableDates, getSlotAvailability, hasScheduleConflict } from '../lib/scheduling';
import type {
  AppNotification,
  AppCatalog,
  Appointment,
  AvailabilitySearchInput,
  AvailabilitySlot,
  AssistantMessage,
  AuthSession,
  ChangePasswordInput,
  CreateAppointmentInput,
  ParishId,
  ParishionerProfile,
  QueueService,
  QueueTicket,
  RepositorySnapshot,
  SignInInput,
  SignUpInput,
  UploadAppointmentDocumentInput,
} from '../types/domain';

export { AppointmentCreatedWithUploadError } from '../api/appointmentSubmission';

export interface ParishLinkRepository {
  readonly mode: 'demo' | 'api';
  loadCatalog(): Promise<AppCatalog>;
  restoreSession(): Promise<AuthSession | null>;
  signIn(input: SignInInput): Promise<AuthSession>;
  signUp(input: SignUpInput): Promise<AuthSession>;
  changePassword(input: ChangePasswordInput): Promise<void>;
  signOut(): Promise<void>;
  loadSnapshot(): Promise<RepositorySnapshot>;
  searchAvailability(input: AvailabilitySearchInput): Promise<AvailabilitySlot[]>;
  createAppointment(input: CreateAppointmentInput): Promise<Appointment>;
  uploadAppointmentDocument(
    appointmentId: string,
    documentId: string,
    input: UploadAppointmentDocumentInput,
  ): Promise<Appointment>;
  markNotificationRead(id: string): Promise<void>;
  joinQueue(parishId: ParishId, service: QueueService): Promise<QueueTicket>;
  leaveQueue(): Promise<void>;
  askAssistant(prompt: string): Promise<AssistantMessage>;
  updateProfile(profile: ParishionerProfile): Promise<ParishionerProfile>;
  resetDemo?(): Promise<void>;
}

const DEMO_ACCOUNTS_KEY = '@parishlink/mobile-demo-v4:accounts';
const DEMO_SESSION_KEY = '@parishlink/mobile-demo-v4:session';

type DemoAccount = {
  id: string;
  profile: ParishionerProfile;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
};

const DEMO_PROFILE: ParishionerProfile = {
  id: 'parishioner-demo',
  displayName: 'Maria Santos',
  email: 'maria.santos@example.test',
  mobileNumber: '+63 917 555 0142',
  homeParishId: 'metropolitan-cathedral',
  notificationsEnabled: true,
};

const makeSeedSnapshot = (profile = DEMO_PROFILE, includeSamples = profile.id === DEMO_PROFILE.id): RepositorySnapshot => {
  const dates = getBookableDates(new Date(), 10);
  const date = dates[3] ?? dates[0] ?? '2026-09-01';
  const now = new Date().toISOString();
  return {
    source: 'demo',
    profile,
    appointments: includeSamples ? [
      {
        id: 'apt-demo-1',
        reference: 'PL-DEMO-1042',
        parishionerId: profile.id,
        serviceId: 'baptism',
        parishId: 'metropolitan-cathedral',
        clergyId: 'clergy-dizon',
        venueId: 'venue-cathedral-main',
        date,
        time: '9:30 AM',
        durationMinutes: 60,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        status: 'pending_verification',
        documents: [
          {
            id: 'doc-demo-1',
            label: "Child's PSA Birth Certificate",
            required: true,
            fileName: 'birth-certificate-demo.pdf',
            status: 'under_review',
            note: 'Waiting for parish staff verification.',
          },
          {
            id: 'doc-demo-2',
            label: 'Godparent qualification form',
            required: true,
            status: 'needs_action',
            note: 'Please upload a clearer copy.',
          },
        ],
        submittedAt: now,
        updatedAt: now,
      },
    ] : [],
    notifications: includeSamples ? [
      {
        id: 'notice-demo-1',
        title: 'Document needs attention',
        body: 'A clearer godparent qualification form is needed for PL-DEMO-1042.',
        createdAt: now,
        target: { kind: 'appointment', appointmentId: 'apt-demo-1' },
      },
      {
        id: 'notice-demo-2',
        title: 'Welcome to the ParishLink demo',
        body: 'Explore service requests, document review, notifications, and the walk-in queue using demonstration data.',
        createdAt: now,
        readAt: now,
        target: { kind: 'home' },
      },
    ] : [{
      id: `notice-welcome-${profile.id}`,
      title: 'Welcome to ParishLink',
      body: 'Your demonstration account is ready. Requests remain local until a production parish API is configured.',
      createdAt: now,
      target: { kind: 'home' },
    }],
  };
};

async function passwordDigest(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

async function makePasswordRecord(password: string): Promise<{ passwordSalt: string; passwordHash: string }> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  const passwordSalt = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { passwordSalt, passwordHash: await passwordDigest(password, passwordSalt) };
}

const wait = (milliseconds = 220) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

class DemoParishLinkRepository implements ParishLinkRepository {
  readonly mode = 'demo' as const;
  private currentUserId = '';

  async loadCatalog(): Promise<AppCatalog> {
    return { parishes: PARISHES, services: SACRAMENT_SERVICES, queueServices: QUEUE_SERVICES };
  }

  private snapshotKey(userId = this.currentUserId): string {
    if (!userId) throw new Error('Sign in to continue.');
    return `@parishlink/mobile-demo-v4:snapshot:${userId}`;
  }

  private async accounts(): Promise<DemoAccount[]> {
    const stored = await AsyncStorage.getItem(DEMO_ACCOUNTS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DemoAccount[];
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Rebuild only the fictional demonstration account when local data is corrupt.
      }
    }
    const password = await makePasswordRecord('parishlink-demo');
    const seeded: DemoAccount[] = [{
      id: DEMO_PROFILE.id,
      profile: DEMO_PROFILE,
      ...password,
      createdAt: new Date().toISOString(),
    }];
    await AsyncStorage.setItem(DEMO_ACCOUNTS_KEY, JSON.stringify(seeded));
    return seeded;
  }

  private async read(): Promise<RepositorySnapshot> {
    const accounts = await this.accounts();
    const account = accounts.find((item) => item.id === this.currentUserId);
    if (!account) throw new Error('Your local session has expired. Sign in again.');
    const stored = await AsyncStorage.getItem(this.snapshotKey());
    if (!stored) {
      const initial = makeSeedSnapshot(account.profile);
      await this.write(initial);
      return initial;
    }
    try {
      return JSON.parse(stored) as RepositorySnapshot;
    } catch {
      const initial = makeSeedSnapshot(account.profile);
      await this.write(initial);
      return initial;
    }
  }

  private async write(snapshot: RepositorySnapshot) {
    await AsyncStorage.setItem(this.snapshotKey(), JSON.stringify(snapshot));
  }

  async restoreSession(): Promise<AuthSession | null> {
    const userId = await AsyncStorage.getItem(DEMO_SESSION_KEY);
    if (!userId) return null;
    const account = (await this.accounts()).find((item) => item.id === userId);
    if (!account) {
      await AsyncStorage.removeItem(DEMO_SESSION_KEY);
      return null;
    }
    this.currentUserId = account.id;
    return { mode: 'demo', profile: account.profile };
  }

  async signIn(input: SignInInput): Promise<AuthSession> {
    await wait();
    const email = normalizeEmail(input.email);
    if (!isEmailAddress(email)) throw new Error('Enter a valid email address.');
    const account = (await this.accounts()).find((item) => normalizeEmail(item.profile.email) === email);
    if (!account || await passwordDigest(input.password, account.passwordSalt) !== account.passwordHash) {
      throw new Error('The email or password is incorrect.');
    }
    this.currentUserId = account.id;
    await AsyncStorage.setItem(DEMO_SESSION_KEY, account.id);
    return { mode: 'demo', profile: account.profile };
  }

  async signUp(input: SignUpInput): Promise<AuthSession> {
    await wait();
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim().replace(/\s+/g, ' ');
    const mobileNumber = input.mobileNumber.trim();
    if (displayName.length < 3) throw new Error('Enter your complete name.');
    if (!isEmailAddress(email)) throw new Error('Enter a valid email address.');
    if (!/^\+?[0-9 ()-]{10,20}$/.test(mobileNumber)) throw new Error('Enter a valid mobile number.');
    assertAcceptablePassword(input.password);
    if (input.password !== input.confirmPassword) throw new Error('The passwords do not match.');
    if (!input.acceptPrivacyNotice) throw new Error('Review and accept the privacy notice to continue.');
    const accounts = await this.accounts();
    if (accounts.some((item) => normalizeEmail(item.profile.email) === email)) {
      throw new Error('An account already uses that email address.');
    }
    const id = `parishioner-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const profile: ParishionerProfile = {
      id,
      displayName,
      email,
      mobileNumber,
      homeParishId: input.homeParishId,
      notificationsEnabled: true,
    };
    const password = await makePasswordRecord(input.password);
    await AsyncStorage.setItem(DEMO_ACCOUNTS_KEY, JSON.stringify([
      ...accounts,
      { id, profile, ...password, createdAt: new Date().toISOString() },
    ] satisfies DemoAccount[]));
    this.currentUserId = id;
    await this.write(makeSeedSnapshot(profile, false));
    await AsyncStorage.setItem(DEMO_SESSION_KEY, id);
    return { mode: 'demo', profile };
  }

  async signOut(): Promise<void> {
    this.currentUserId = '';
    await AsyncStorage.removeItem(DEMO_SESSION_KEY);
  }

  async changePassword(input: ChangePasswordInput): Promise<void> {
    const accounts = await this.accounts();
    const account = accounts.find((item) => item.id === this.currentUserId);
    if (!account || await passwordDigest(input.currentPassword, account.passwordSalt) !== account.passwordHash) {
      throw new Error('The current password is incorrect.');
    }
    assertAcceptablePassword(input.newPassword);
    if (input.newPassword !== input.confirmPassword) throw new Error('The new passwords do not match.');
    if (input.currentPassword === input.newPassword) throw new Error('Choose a new password that is different from the current password.');
    const nextPassword = await makePasswordRecord(input.newPassword);
    await AsyncStorage.setItem(DEMO_ACCOUNTS_KEY, JSON.stringify(accounts.map((item) =>
      item.id === account.id ? { ...item, ...nextPassword } : item,
    )));
  }

  async loadSnapshot() {
    await wait(120);
    return this.read();
  }

  async searchAvailability(input: AvailabilitySearchInput) {
    const snapshot = await this.read();
    return getSlotAvailability(
      input.date,
      input.clergyId,
      input.venueId,
      SACRAMENT_SERVICES.find((service) => service.id === input.serviceId)?.durationMinutes ?? 60,
      snapshot.appointments,
    );
  }

  async createAppointment(input: CreateAppointmentInput) {
    await wait();
    const snapshot = await this.read();
    if (hasScheduleConflict(input, snapshot.appointments)) {
      throw new Error('That priest or venue is no longer available for the full service time. Choose another slot.');
    }
    const now = new Date().toISOString();
    const id = `apt-${Date.now()}`;
    const appointment: Appointment = {
      id,
      reference: `PL-DEMO-${String(Date.now()).slice(-5)}`,
      parishionerId: snapshot.profile.id,
      ...input,
      status: 'submitted',
      documents: input.documents.map((document) => {
        const note =
          document.status === 'selected'
            ? 'Submitted for human verification by parish staff.'
            : document.note;
        return {
          ...document,
          status: document.status === 'selected' ? 'submitted' : document.status,
          updatedAt: now,
          ...(note ? { note } : {}),
        };
      }),
      submittedAt: now,
      updatedAt: now,
    };
    const notification: AppNotification = {
      id: `notice-${Date.now()}`,
      title: 'Request submitted',
      body: `${appointment.reference} was submitted. This is not yet parish approval.`,
      createdAt: now,
      target: { kind: 'appointment', appointmentId: id },
    };
    await this.write({
      ...snapshot,
      appointments: [appointment, ...snapshot.appointments],
      notifications: [notification, ...snapshot.notifications],
    });
    return appointment;
  }

  async uploadAppointmentDocument(
    appointmentId: string,
    documentId: string,
    input: UploadAppointmentDocumentInput,
  ): Promise<Appointment> {
    const snapshot = await this.read();
    const appointment = snapshot.appointments.find((item) => item.id === appointmentId);
    if (!appointment) throw new Error('The saved request could not be found.');
    if (!appointment.documents.some((document) => document.id === documentId)) {
      throw new Error('The document requirement could not be found.');
    }
    const now = new Date().toISOString();
    const updated: Appointment = {
      ...appointment,
      status: ['submitted', 'needs_action'].includes(appointment.status)
        ? 'pending_verification'
        : appointment.status,
      documents: appointment.documents.map((document) => document.id === documentId ? {
        ...document,
        fileName: input.fileName,
        mimeType: input.mimeType,
        ...(input.sizeBytes === undefined ? {} : { sizeBytes: input.sizeBytes }),
        status: 'submitted',
        note: 'Submitted for human verification by parish staff.',
        updatedAt: now,
      } : document),
      updatedAt: now,
    };
    await this.write({
      ...snapshot,
      appointments: snapshot.appointments.map((item) => item.id === appointmentId ? updated : item),
    });
    return updated;
  }

  async markNotificationRead(id: string) {
    const snapshot = await this.read();
    const now = new Date().toISOString();
    await this.write({
      ...snapshot,
      notifications: snapshot.notifications.map((notification) =>
        notification.id === id
          ? { ...notification, readAt: notification.readAt ?? now }
          : notification,
      ),
    });
  }

  async joinQueue(parishId: ParishId, service: QueueService) {
    const snapshot = await this.read();
    if (snapshot.activeQueueTicket && snapshot.activeQueueTicket.status !== 'cancelled') {
      throw new Error('You already have an active walk-in ticket.');
    }
    const now = new Date().toISOString();
    const ahead = 3;
    const ticket: QueueTicket = {
      id: `queue-${Date.now()}`,
      number: `Q-${String(Math.floor(Math.random() * 90) + 10)}`,
      parishId,
      service,
      status: 'waiting',
      ahead,
      estimatedWaitMinutes: ahead * 8,
      issuedAt: now,
      lastUpdatedAt: now,
    };
    await this.write({ ...snapshot, activeQueueTicket: ticket });
    return ticket;
  }

  async leaveQueue() {
    const snapshot = await this.read();
    const { activeQueueTicket: _activeQueueTicket, ...withoutTicket } = snapshot;
    await this.write(withoutTicket);
  }

  async askAssistant(prompt: string) {
    await wait(360);
    const reply = getDemoGuidance(prompt, await this.read());
    return {
      id: `assistant-${Date.now()}`,
      from: 'assistant',
      createdAt: new Date().toISOString(),
      ...reply,
    } satisfies AssistantMessage;
  }

  async updateProfile(profile: ParishionerProfile) {
    const snapshot = await this.read();
    await this.write({ ...snapshot, profile });
    const accounts = await this.accounts();
    await AsyncStorage.setItem(DEMO_ACCOUNTS_KEY, JSON.stringify(
      accounts.map((account) => account.id === this.currentUserId ? { ...account, profile } : account),
    ));
    return profile;
  }

  async resetDemo() {
    await AsyncStorage.removeItem(this.snapshotKey());
  }
}

class ApiParishLinkRepository implements ParishLinkRepository {
  readonly mode = 'api' as const;
  private accessToken = '';
  private readonly client: MobileApiClient;

  constructor(baseUrl: string) {
    this.client = new MobileApiClient(baseUrl, () => this.accessToken);
  }

  async loadCatalog(): Promise<AppCatalog> {
    const catalog = await this.request<AppCatalog>('/mobile/catalog');
    applyCatalog(catalog);
    return catalog;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.client.request<T>(path, init);
  }

  async restoreSession(): Promise<AuthSession | null> {
    this.accessToken = await getMobileApiToken() ?? '';
    if (!this.accessToken) return null;
    try {
      return await this.request<AuthSession>('/mobile/auth/session');
    } catch {
      this.accessToken = '';
      await clearMobileApiToken();
      return null;
    }
  }

  async signIn(input: SignInInput) {
    const session = await this.request<AuthSession>('/mobile/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    this.accessToken = session.accessToken ?? '';
    if (this.accessToken) await setMobileApiToken(this.accessToken);
    return session;
  }

  async signUp(input: SignUpInput) {
    const session = await this.request<AuthSession>('/mobile/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    this.accessToken = session.accessToken ?? '';
    if (this.accessToken) await setMobileApiToken(this.accessToken);
    return session;
  }

  async signOut(): Promise<void> {
    try {
      if (this.accessToken) await this.request<void>('/mobile/auth/sign-out', { method: 'POST' });
    } finally {
      this.accessToken = '';
      await clearMobileApiToken();
    }
  }

  changePassword(input: ChangePasswordInput): Promise<void> {
    return this.request<void>('/mobile/auth/change-password', { method: 'POST', body: JSON.stringify(input) });
  }

  loadSnapshot() {
    return this.request<RepositorySnapshot>('/mobile/snapshot');
  }

  async searchAvailability(input: AvailabilitySearchInput) {
    const result = await this.request<{ slots: AvailabilitySlot[] }>('/mobile/availability', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return result.slots;
  }

  async createAppointment(input: CreateAppointmentInput) {
    return submitAppointmentWithDocuments(input, {
      randomUUID: Crypto.randomUUID,
      create: (metadata, idempotencyKey) => this.request<Appointment>('/mobile/appointments', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(metadata),
      }),
      upload: (appointment, localDocument, serverDocument) => this.uploadAppointmentDocument(
        appointment.id,
        serverDocument.id,
        {
          fileUri: localDocument.fileUri as string,
          fileName: localDocument.fileName ?? 'document',
          mimeType: localDocument.mimeType ?? 'application/octet-stream',
          ...(localDocument.sizeBytes === undefined ? {} : { sizeBytes: localDocument.sizeBytes }),
        },
      ),
    });
  }

  async uploadAppointmentDocument(
    appointmentId: string,
    documentId: string,
    input: UploadAppointmentDocumentInput,
  ): Promise<Appointment> {
    const body = new FormData();
    if (Platform.OS === 'web') {
      const blob = await fetch(input.fileUri).then((response) => response.blob());
      body.append('file', blob, input.fileName);
    } else {
      body.append('file', {
        uri: input.fileUri,
        name: input.fileName,
        type: input.mimeType,
      } as unknown as Blob);
    }
    return this.request<Appointment>(
      `/mobile/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(documentId)}`,
      { method: 'POST', body },
    );
  }

  markNotificationRead(id: string) {
    return this.request<void>(`/mobile/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
  }

  joinQueue(parishId: ParishId, service: QueueService) {
    return this.request<QueueTicket>('/mobile/queue/tickets', {
      method: 'POST',
      headers: { 'Idempotency-Key': `queue-${Crypto.randomUUID()}` },
      body: JSON.stringify({ parishId, service }),
    });
  }

  leaveQueue() {
    return this.request<void>('/mobile/queue/tickets/active', { method: 'DELETE' });
  }

  askAssistant(prompt: string) {
    return this.request<AssistantMessage>('/mobile/assistant', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
  }

  updateProfile(profile: ParishionerProfile) {
    return this.request<ParishionerProfile>('/mobile/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  }
}

export const createParishLinkRepository = (): ParishLinkRepository => {
  if (demoMode) return new DemoParishLinkRepository();
  if (!apiBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required when demo mode is disabled.');
  }
  return new ApiParishLinkRepository(apiBaseUrl);
};
