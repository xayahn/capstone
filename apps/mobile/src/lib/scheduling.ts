import type { Appointment, SacramentId } from '../types/domain';

export const TIME_SLOTS = [
  '8:00 AM',
  '9:30 AM',
  '11:00 AM',
  '1:30 PM',
  '3:00 PM',
  '4:30 PM',
] as const;

const NON_BLOCKING_STATUSES = new Set<Appointment['status']>([
  'rejected',
  'cancelled',
]);

export interface CandidateSlot {
  date: string;
  time: string;
  clergyId: string;
  venueId: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

const toMinutes = (time: string) => {
  const match = /^(\d{1,2}):(\d{2})\s(AM|PM)$/.exec(time);
  if (!match) throw new Error(`Unsupported time format: ${time}`);
  const hourText = match[1];
  const minuteText = match[2];
  const meridiem = match[3];
  if (!hourText || !minuteText || !meridiem) {
    throw new Error(`Unsupported time format: ${time}`);
  }
  const hour = Number(hourText) % 12;
  return hour * 60 + Number(minuteText) + (meridiem === 'PM' ? 720 : 0);
};

const intervalFor = ({
  time,
  durationMinutes,
  bufferBeforeMinutes,
  bufferAfterMinutes,
}: Pick<
  CandidateSlot,
  'time' | 'durationMinutes' | 'bufferBeforeMinutes' | 'bufferAfterMinutes'
>) => ({
  start: toMinutes(time) - bufferBeforeMinutes,
  end: toMinutes(time) + durationMinutes + bufferAfterMinutes,
});

const intervalsOverlap = (
  left: ReturnType<typeof intervalFor>,
  right: ReturnType<typeof intervalFor>,
) => left.start < right.end && right.start < left.end;

export const hasScheduleConflict = (
  candidate: CandidateSlot,
  appointments: Appointment[],
  excludeAppointmentId?: string,
) =>
  appointments.some((appointment) => {
    if (appointment.id === excludeAppointmentId) return false;
    if (NON_BLOCKING_STATUSES.has(appointment.status)) return false;
    if (appointment.date !== candidate.date) return false;

    const overlaps = intervalsOverlap(intervalFor(candidate), intervalFor(appointment));
    if (!overlaps) return false;

    return (
      appointment.clergyId === candidate.clergyId ||
      appointment.venueId === candidate.venueId
    );
  });

export const getSlotAvailability = (
  date: string,
  clergyId: string,
  venueId: string,
  durationMinutes: number,
  appointments: Appointment[],
  bufferBeforeMinutes = 15,
  bufferAfterMinutes = 15,
  excludeAppointmentId?: string,
) =>
  TIME_SLOTS.map((time) => ({
    time,
    available: !hasScheduleConflict(
      {
        date,
        time,
        clergyId,
        venueId,
        durationMinutes,
        bufferBeforeMinutes,
        bufferAfterMinutes,
      },
      appointments,
      excludeAppointmentId,
    ),
  }));

export const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getBookableDates = (now = new Date(), count = 8) => {
  const dates: string[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  while (dates.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() !== 0) dates.push(toIsoDate(cursor));
  }

  return dates;
};

export const formatDate = (date: string, compact = false) => {
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat('en-PH', {
    weekday: compact ? 'short' : 'long',
    month: 'short',
    day: 'numeric',
    year: compact ? undefined : 'numeric',
  }).format(parsed);
};

export const estimateQueueWait = (ahead: number, minutesPerPerson = 8) =>
  Math.max(0, ahead) * minutesPerPerson;

/**
 * Formats digit-only keypad entry into YYYY-MM-DD so iOS numeric keyboards
 * (which lack a hyphen key) work seamlessly without trapping Backspace.
 */
export const formatBirthDateInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

/**
 * Validates optional YYYY-MM-DD birth dates using the exact calendar and range
 * rules enforced by backend/services/mobile-service.ts (1900 through today).
 */
export const validateBirthDate = (value: string, now: Date = new Date()): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return 'Enter all 8 digits of the birth date (YYYY-MM-DD), or leave it blank.';
  }
  const [yearPart, monthPart, dayPart] = trimmed.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const calendarUtc = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    calendarUtc.getUTCFullYear() !== year ||
    calendarUtc.getUTCMonth() !== month - 1 ||
    calendarUtc.getUTCDate() !== day
  ) {
    return 'Enter a real calendar date (YYYY-MM-DD) from 1900 onward.';
  }
  const middayUtc = new Date(`${trimmed}T12:00:00Z`);
  if (Number.isNaN(middayUtc.getTime()) || middayUtc.getTime() > now.getTime()) {
    return 'Birth date cannot be in the future.';
  }
  return null;
};

export interface ParticipantFieldConfig {
  primaryType: 'candidate' | 'principal' | 'deceased';
  primaryLabel: string;
  primaryReviewLabel: string;
  primaryBirthLabel: string;
  secondaryType?: 'partner';
  secondaryLabel?: string;
  secondaryReviewLabel?: string;
  secondaryBirthLabel?: string;
  guidanceBody: string;
}

export const getParticipantFields = (serviceId: SacramentId): ParticipantFieldConfig => {
  switch (serviceId) {
    case 'baptism':
      return {
        primaryType: 'candidate',
        primaryLabel: 'Child or candidate’s complete name',
        primaryReviewLabel: 'Child / candidate',
        primaryBirthLabel: 'Child’s birth date (optional, YYYY-MM-DD)',
        guidanceBody:
          'Enter the full name of the child or person to be baptized. Parish staff will verify parent and godparent details from your certificates.',
      };
    case 'wedding':
      return {
        primaryType: 'principal',
        primaryLabel: 'Bride or first partner’s complete name',
        primaryReviewLabel: 'First partner',
        primaryBirthLabel: 'First partner’s birth date (optional, YYYY-MM-DD)',
        secondaryType: 'partner',
        secondaryLabel: 'Groom or second partner’s complete name',
        secondaryReviewLabel: 'Second partner',
        secondaryBirthLabel: 'Second partner’s birth date (optional, YYYY-MM-DD)',
        guidanceBody:
          'Enter both engaged partners’ complete names for canonical interview and marriage banns preparation.',
      };
    case 'confirmation':
      return {
        primaryType: 'candidate',
        primaryLabel: 'Confirmand’s complete name',
        primaryReviewLabel: 'Confirmand',
        primaryBirthLabel: 'Confirmand’s birth date (optional, YYYY-MM-DD)',
        guidanceBody:
          'Enter the complete name of the person receiving Confirmation.',
      };
    case 'first_communion':
      return {
        primaryType: 'candidate',
        primaryLabel: 'Communicant’s complete name',
        primaryReviewLabel: 'Communicant',
        primaryBirthLabel: 'Communicant’s birth date (optional, YYYY-MM-DD)',
        guidanceBody:
          'Enter the complete name of the child or candidate preparing for First Holy Communion.',
      };
    case 'funeral':
      return {
        primaryType: 'deceased',
        primaryLabel: 'Deceased’s complete name',
        primaryReviewLabel: 'Deceased',
        primaryBirthLabel: 'Deceased’s birth date (optional, YYYY-MM-DD)',
        guidanceBody:
          'Enter the complete name of the faithful departed for the Funeral Mass intention and parish register.',
      };
  }
};
