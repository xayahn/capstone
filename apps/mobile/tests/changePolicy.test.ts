import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Appointment } from '../src/types/domain';

const { storage, tokenStore } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  tokenStore: {
    getMobileApiToken: vi.fn(),
    setMobileApiToken: vi.fn(),
    clearMobileApiToken: vi.fn(),
  },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: async (key: string) => {
      storage.delete(key);
    },
  },
}));

vi.mock('expo-crypto', async () => {
  const crypto = await import('node:crypto');
  return {
    randomUUID: crypto.randomUUID,
    CryptoDigestAlgorithm: { SHA256: 'sha256' },
    getRandomBytesAsync: async (size: number) => new Uint8Array(crypto.randomBytes(size)),
    digestStringAsync: async (_algorithm: string, value: string) =>
      crypto.createHash('sha256').update(value).digest('hex'),
  };
});

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('../src/api/tokenStore', () => tokenStore);

import { appointmentStart, changeOptionsFor, localChangeOptions } from '../src/lib/changePolicy';
import { getBookableDates, getSlotAvailability } from '../src/lib/scheduling';
import {
  ApiParishLinkRepository,
  DemoParishLinkRepository,
} from '../src/repositories/parishLinkRepository';

const makeAppointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 'apt-change-1',
  reference: 'PL-2026-2001',
  parishionerId: 'parishioner-demo',
  serviceId: 'baptism',
  parishId: 'metropolitan-cathedral',
  clergyId: 'clergy-dizon',
  venueId: 'venue-cathedral-main',
  date: '2026-11-20',
  time: '9:30 AM',
  durationMinutes: 60,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  status: 'pending_verification',
  documents: [],
  submittedAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  storage.clear();
  tokenStore.getMobileApiToken.mockResolvedValue('synthetic-token');
  tokenStore.setMobileApiToken.mockResolvedValue(undefined);
  tokenStore.clearMobileApiToken.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parishioner appointment change policy', () => {
  it('parses Manila display times accurately and rejects invalid dates or times', () => {
    const morning = appointmentStart({ date: '2026-11-20', time: '9:30 AM' });
    const afternoon = appointmentStart({ date: '2026-11-20', time: '1:30 PM' });
    const noon = appointmentStart({ date: '2026-11-20', time: '12:00 PM' });
    expect(morning?.toISOString()).toBe('2026-11-20T01:30:00.000Z');
    expect(afternoon?.toISOString()).toBe('2026-11-20T05:30:00.000Z');
    expect(noon?.toISOString()).toBe('2026-11-20T04:00:00.000Z');
    expect(appointmentStart({ date: '2026/11/20', time: '9:30 AM' })).toBeNull();
    expect(appointmentStart({ date: '2026-11-20', time: '25:00' })).toBeNull();
  });

  it('allows immediate cancellation and >=24h reschedule before parish approval', () => {
    const now = new Date('2026-11-18T00:00:00.000Z'); // >48h before 2026-11-20 09:30+08:00
    expect(localChangeOptions(makeAppointment({ status: 'submitted' }), now)).toEqual({
      cancel: 'immediate',
      reschedule: true,
    });
    expect(localChangeOptions(makeAppointment({ status: 'needs_action' }), now)).toEqual({
      cancel: 'immediate',
      reschedule: true,
    });
  });

  it('blocks reschedule inside 24 hours and requires a cancellation request once approved', () => {
    const farNow = new Date('2026-11-18T00:00:00.000Z');
    const nearNow = new Date('2026-11-19T12:00:00.000Z'); // 13.5h before 2026-11-20 01:30Z
    expect(localChangeOptions(makeAppointment({ status: 'approved' }), farNow)).toEqual({
      cancel: 'request',
      reschedule: true,
    });
    expect(localChangeOptions(makeAppointment({ status: 'approved' }), nearNow)).toEqual({
      cancel: 'request',
      reschedule: false,
    });
    expect(localChangeOptions(makeAppointment({ status: 'pending_verification' }), nearNow)).toEqual({
      cancel: 'immediate',
      reschedule: false,
    });
  });

  it('locks duplicate change requests and blocks past or terminal appointments', () => {
    const now = new Date('2026-11-18T00:00:00.000Z');
    const pendingApproved = makeAppointment({
      status: 'approved',
      pendingChange: {
        kind: 'reschedule',
        proposedDate: '2026-11-25',
        proposedTime: '11:00 AM',
        reason: 'Sponsor travel change',
        requestedAt: now.toISOString(),
      },
    });
    expect(localChangeOptions(pendingApproved, now)).toEqual({
      cancel: null,
      reschedule: false,
    });
    expect(localChangeOptions(makeAppointment({ status: 'cancelled' }), now)).toEqual({
      cancel: null,
      reschedule: false,
    });
    expect(localChangeOptions(makeAppointment({ status: 'approved' }), new Date('2026-11-21T00:00:00.000Z'))).toEqual({
      cancel: null,
      reschedule: false,
    });
  });

  it('defers to authoritative server allowedChanges when present', () => {
    const now = new Date('2026-11-18T00:00:00.000Z');
    const appointment = makeAppointment({
      status: 'approved',
      allowedChanges: { cancel: null, reschedule: false },
    });
    expect(changeOptionsFor(appointment, now)).toEqual({ cancel: null, reschedule: false });
  });
});

describe('slot availability with excludeAppointmentId', () => {
  it('excludes the appointment being rescheduled while still blocking other bookings', () => {
    const own = makeAppointment({ id: 'apt-own', date: '2026-11-20', time: '9:30 AM' });
    const other = makeAppointment({ id: 'apt-other', date: '2026-11-20', time: '11:00 AM' });

    const withoutExclude = getSlotAvailability(
      '2026-11-20',
      'clergy-dizon',
      'venue-cathedral-main',
      60,
      [own, other],
      15,
      15,
    );
    expect(withoutExclude.find((slot) => slot.time === '9:30 AM')?.available).toBe(false);
    expect(withoutExclude.find((slot) => slot.time === '11:00 AM')?.available).toBe(false);

    const withExclude = getSlotAvailability(
      '2026-11-20',
      'clergy-dizon',
      'venue-cathedral-main',
      60,
      [own, other],
      15,
      15,
      'apt-own',
    );
    expect(withExclude.find((slot) => slot.time === '9:30 AM')?.available).toBe(true);
    expect(withExclude.find((slot) => slot.time === '11:00 AM')?.available).toBe(false);
  });
});

describe('DemoParishLinkRepository announcements, reminders, and schedule changes', () => {
  it('loads parish contact info, announcements, and deduplicated reminders, and processes reschedule/withdraw/cancel', async () => {
    const repo = new DemoParishLinkRepository();
    const catalog = await repo.loadCatalog();
    expect(catalog.parishes).toHaveLength(8);
    expect(catalog.parishes.every((parish) => Boolean(parish.contact?.officeHours && parish.contact?.email))).toBe(true);

    await repo.signIn({ email: 'maria.santos@example.test', password: 'parishlink-demo' });
    const firstSnapshot = await repo.loadSnapshot();
    expect(firstSnapshot.announcements?.length).toBeGreaterThanOrEqual(2);
    const docReminders = firstSnapshot.notifications.filter((item) => item.id === 'reminder:apt-demo-1:documents');
    expect(docReminders).toHaveLength(1);

    const secondSnapshot = await repo.loadSnapshot();
    expect(secondSnapshot.notifications.filter((item) => item.id === 'reminder:apt-demo-1:documents')).toHaveLength(1);

    const futureDates = getBookableDates(new Date(), 12);
    const targetDate = futureDates.at(-1)!;
    const rescheduled = await repo.requestReschedule('apt-demo-1', {
      date: targetDate,
      time: '1:30 PM',
      reason: 'Godparents arrive in the afternoon.',
    });
    expect(rescheduled.pendingChange).toMatchObject({
      kind: 'reschedule',
      proposedDate: targetDate,
      proposedTime: '1:30 PM',
    });

    const withdrawn = await repo.withdrawChangeRequest('apt-demo-1');
    expect(withdrawn.pendingChange).toBeNull();

    const cancelled = await repo.cancelAppointment('apt-demo-1', 'Need to gather PSA records first.');
    expect(cancelled.status).toBe('cancelled');
  }, 15_000);
});

describe('ApiParishLinkRepository schedule-change endpoints', () => {
  it('sends excludeAppointmentId on availability queries and calls cancel, reschedule, and withdraw routes', async () => {
    const sampleAppointment = makeAppointment();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes('/mobile/availability')) {
        return Response.json({ slots: [{ time: '1:30 PM', available: true }] });
      }
      if (String(url).endsWith('/sign-in')) {
        return Response.json({
          mode: 'api',
          accessToken: 'synthetic-token',
          profile: {
            id: 'parishioner-demo',
            displayName: 'Maria Santos',
            email: 'maria.santos@example.test',
            mobileNumber: '+63 917 555 0142',
            homeParishId: 'metropolitan-cathedral',
            notificationsEnabled: true,
          },
        });
      }
      return Response.json(sampleAppointment);
    });
    vi.stubGlobal('fetch', fetchMock);

    const repo = new ApiParishLinkRepository('http://localhost:3000/api');
    await repo.signIn({ email: 'maria.santos@example.test', password: 'SyntheticPassword7' });
    await repo.searchAvailability({
      parishId: 'metropolitan-cathedral',
      serviceId: 'baptism',
      clergyId: 'clergy-dizon',
      venueId: 'venue-cathedral-main',
      date: '2026-11-25',
      excludeAppointmentId: 'apt-change-1',
    });
    expect(String(fetchMock.mock.calls[1]?.[0]).endsWith('/mobile/availability')).toBe(true);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      excludeAppointmentId: 'apt-change-1',
    });

    await repo.requestReschedule('apt-change-1', {
      date: '2026-11-25',
      time: '1:30 PM',
      reason: 'Sponsor schedule adjustment',
    });
    expect(String(fetchMock.mock.calls[2]?.[0]).endsWith('/mobile/appointments/apt-change-1/reschedule')).toBe(true);

    await repo.withdrawChangeRequest('apt-change-1');
    expect(String(fetchMock.mock.calls[3]?.[0]).endsWith('/mobile/appointments/apt-change-1/change-request/withdraw')).toBe(true);

    await repo.cancelAppointment('apt-change-1', 'Family postponed event');
    expect(String(fetchMock.mock.calls[4]?.[0]).endsWith('/mobile/appointments/apt-change-1/cancel')).toBe(true);
  });
});
