import { describe, expect, it } from 'vitest';
import { getBookableDates, hasScheduleConflict } from '../src/lib/scheduling';
import type { Appointment } from '../src/types/domain';

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 'apt-1',
  reference: 'PL-1001',
  parishionerId: 'parishioner-demo',
  serviceId: 'baptism',
  parishId: 'san-guillermo',
  clergyId: 'fr-a-manalo',
  venueId: 'venue-san-guillermo',
  date: '2026-09-01',
  time: '9:30 AM',
  durationMinutes: 60,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  status: 'approved',
  documents: [],
  submittedAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
  ...overrides,
});

describe('hasScheduleConflict', () => {
  it('blocks an occupied priest even if the venue differs', () => {
    expect(
      hasScheduleConflict(
        {
          date: '2026-09-01',
          time: '9:30 AM',
          clergyId: 'fr-a-manalo',
          venueId: 'another-venue',
          durationMinutes: 45,
          bufferBeforeMinutes: 15,
          bufferAfterMinutes: 15,
        },
        [appointment()],
      ),
    ).toBe(true);
  });

  it('blocks an occupied venue even if the priest differs', () => {
    expect(
      hasScheduleConflict(
        {
          date: '2026-09-01',
          time: '9:30 AM',
          clergyId: 'another-priest',
          venueId: 'venue-san-guillermo',
          durationMinutes: 90,
          bufferBeforeMinutes: 15,
          bufferAfterMinutes: 15,
        },
        [appointment()],
      ),
    ).toBe(true);
  });

  it('does not let rejected or cancelled requests reserve a slot', () => {
    const candidate = {
      date: '2026-09-01',
      time: '9:30 AM',
      clergyId: 'fr-a-manalo',
      venueId: 'venue-san-guillermo',
      durationMinutes: 60,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
    };
    expect(
      hasScheduleConflict(candidate, [appointment({ status: 'rejected' })]),
    ).toBe(false);
    expect(
      hasScheduleConflict(candidate, [appointment({ status: 'cancelled' })]),
    ).toBe(false);
  });

  it('blocks partially overlapping intervals even when start times differ', () => {
    expect(
      hasScheduleConflict(
        {
          date: '2026-09-01',
          time: '11:00 AM',
          clergyId: 'fr-a-manalo',
          venueId: 'another-venue',
          durationMinutes: 45,
          bufferBeforeMinutes: 15,
          bufferAfterMinutes: 15,
        },
        [appointment({ time: '10:00 AM', durationMinutes: 60 })],
      ),
    ).toBe(true);
  });

  it('permits back-to-back effective intervals that only touch', () => {
    expect(
      hasScheduleConflict(
        {
          date: '2026-09-01',
          time: '11:30 AM',
          clergyId: 'fr-a-manalo',
          venueId: 'venue-san-guillermo',
          durationMinutes: 45,
          bufferBeforeMinutes: 15,
          bufferAfterMinutes: 15,
        },
        [appointment({ time: '10:00 AM', durationMinutes: 60 })],
      ),
    ).toBe(false);
  });
});

describe('getBookableDates', () => {
  it('returns future dates and omits Sundays', () => {
    const dates = getBookableDates(new Date('2026-08-29T10:00:00'), 3);
    expect(dates).toEqual(['2026-08-31', '2026-09-01', '2026-09-02']);
  });
});
