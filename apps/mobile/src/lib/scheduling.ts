import type { Appointment } from '../types/domain';

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
