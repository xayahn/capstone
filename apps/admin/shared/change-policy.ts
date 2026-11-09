import type { AppointmentStatus } from '@/shared/domain';

/**
 * Parishioner change policy (approved by the project team, 9 Nov 2026):
 * - Before parish approval, a parishioner may cancel immediately (a reason is recorded).
 * - After approval, cancelling becomes a request that parish personnel confirm.
 * - A reschedule is always a request: same priest and venue, new time. Parish staff
 *   or the assigned priest decide it; the conflict check runs again on approval, and an
 *   approved appointment returns to "ready to approve" so the priest re-confirms.
 * - Changes are only possible for upcoming appointments; at most one request is open at a time.
 */
export const PRE_APPROVAL_STATUSES: readonly AppointmentStatus[] = ['submitted', 'documents_pending', 'under_review', 'needs_changes', 'ready_to_approve'];
export const RESCHEDULABLE_STATUSES: readonly AppointmentStatus[] = [...PRE_APPROVAL_STATUSES, 'approved'];
export const TERMINAL_STATUSES: readonly AppointmentStatus[] = ['rejected', 'completed', 'cancelled', 'no_show'];

/** A reschedule must be requested at least this long before the current appointment time. */
export const RESCHEDULE_MIN_NOTICE_HOURS = 24;

export type ParishionerChangeOptions = {
  cancel: 'immediate' | 'request' | null;
  reschedule: boolean;
};

export function parishionerChangeOptions(
  status: AppointmentStatus,
  startsAt: string,
  hasPendingRequest: boolean,
  now: Date = new Date(),
): ParishionerChangeOptions {
  const msUntil = new Date(startsAt).getTime() - now.getTime();
  if (!Number.isFinite(msUntil) || msUntil <= 0) return { cancel: null, reschedule: false };
  const preApproval = PRE_APPROVAL_STATUSES.includes(status);
  const cancel = preApproval ? 'immediate' : status === 'approved' && !hasPendingRequest ? 'request' : null;
  const reschedule = RESCHEDULABLE_STATUSES.includes(status) && !hasPendingRequest
    && msUntil >= RESCHEDULE_MIN_NOTICE_HOURS * 3_600_000;
  return { cancel, reschedule };
}
