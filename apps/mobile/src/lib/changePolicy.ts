import type { AllowedChanges, Appointment } from '../types/domain';

/**
 * Mirrors the server's parishioner change policy (apps/admin/shared/change-policy.ts).
 * The server's `allowedChanges` is authoritative; this is used by the offline demo
 * repository and as a conservative fallback when an older server omits it.
 */
const PRE_APPROVAL = new Set(['submitted', 'pending_verification', 'needs_action']);
export const RESCHEDULE_MIN_NOTICE_HOURS = 24;

/** Parse the appointment's Manila-local date and display time into an instant. */
export const appointmentStart = (appointment: Pick<Appointment, 'date' | 'time'>): Date | null => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(appointment.time.trim());
  const hourText = match?.[1];
  const minuteText = match?.[2];
  const meridiem = match?.[3];
  if (!hourText || !minuteText || !meridiem || !/^\d{4}-\d{2}-\d{2}$/.test(appointment.date)) return null;
  let hour = Number(hourText) % 12;
  if (meridiem.toUpperCase() === 'PM') hour += 12;
  const value = new Date(`${appointment.date}T${String(hour).padStart(2, '0')}:${minuteText}:00+08:00`);
  return Number.isNaN(value.getTime()) ? null : value;
};

export const localChangeOptions = (appointment: Appointment, now: Date = new Date()): AllowedChanges => {
  const start = appointmentStart(appointment);
  if (!start || start.getTime() <= now.getTime()) return { cancel: null, reschedule: false };
  const pending = Boolean(appointment.pendingChange);
  const preApproval = PRE_APPROVAL.has(appointment.status);
  const approved = appointment.status === 'approved' || appointment.status === 'scheduled';
  return {
    cancel: preApproval ? 'immediate' : approved && !pending ? 'request' : null,
    reschedule: (preApproval || approved) && !pending
      && start.getTime() - now.getTime() >= RESCHEDULE_MIN_NOTICE_HOURS * 3_600_000,
  };
};

/** The options the UI should offer: the server's decision when present, otherwise the local mirror. */
export const changeOptionsFor = (appointment: Appointment, now: Date = new Date()): AllowedChanges =>
  appointment.allowedChanges ?? localChangeOptions(appointment, now);
