import type { AppointmentStatus, InternalUserRole } from '@/shared/domain';

export const TERMINAL_APPOINTMENT_STATUSES = new Set<AppointmentStatus>([
  'rejected',
  'completed',
  'cancelled',
  'no_show',
]);

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  submitted: ['documents_pending', 'under_review', 'rejected', 'cancelled'],
  documents_pending: ['under_review', 'needs_changes', 'cancelled'],
  under_review: ['documents_pending', 'needs_changes', 'ready_to_approve', 'rejected', 'cancelled'],
  needs_changes: ['documents_pending', 'under_review', 'cancelled'],
  ready_to_approve: ['approved', 'needs_changes', 'rejected'],
  approved: ['completed', 'cancelled', 'no_show'],
  rejected: [],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function allowedAppointmentTransitions(
  status: AppointmentStatus,
  role: InternalUserRole,
): AppointmentStatus[] {
  const allowed = [...TRANSITIONS[status]];
  if (role === 'clergy') {
    return allowed.filter((next) => ['ready_to_approve', 'approved', 'rejected', 'completed', 'no_show'].includes(next));
  }
  if (role === 'parish_staff') {
    return allowed.filter((next) => next !== 'approved' && next !== 'rejected');
  }
  return allowed;
}

export function intervalsOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
): boolean {
  const aStart = Date.parse(firstStart);
  const aEnd = Date.parse(firstEnd);
  const bStart = Date.parse(secondStart);
  const bEnd = Date.parse(secondEnd);
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function isBlockingAppointmentStatus(status: AppointmentStatus): boolean {
  return !TERMINAL_APPOINTMENT_STATUSES.has(status);
}
