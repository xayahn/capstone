import { getRawDb } from '@/db/runtime';
import { scoped } from '@/backend/services/admin-scope';
import { resourceConflict } from '@/shared/scheduling';
import type { Actor, AppointmentStatus, ChangeRequest } from '@/shared/domain';

/**
 * Read model for the admin "Change requests" queue. Decisions are performed by
 * `decideChangeRequest` in admin-service so they share the portal's idempotency
 * and audit helpers.
 */

type Row = Omit<ChangeRequest, 'canDecide' | 'proposedSlotAvailable'> & {
  clergyId: string | null;
  venueId: string | null;
  bufferBefore: number;
  bufferAfter: number;
};

/** Staff of the appointment's parish or the assigned priest may decide. System administrators may only view. */
export function canDecideChangeRequest(actor: Actor, appointment: { parishId: string; clergyId: string | null }): boolean {
  if (actor.role === 'parish_staff') return Boolean(actor.parishId && actor.parishId === appointment.parishId);
  if (actor.role === 'clergy') return Boolean(actor.clergyProfileId && actor.clergyProfileId === appointment.clergyId);
  return false;
}

export async function loadChangeRequests(actor: Actor): Promise<ChangeRequest[]> {
  const scope = scoped('a', actor, true);
  const db = getRawDb();
  const result = await db.prepare(`SELECT cr.id, cr.appointment_id AS appointmentId, a.reference, a.parishioner_name AS parishioner,
      s.name AS service, a.parish_id AS parishId, p.name AS parish,
      COALESCE(a.clergy_name, 'Unassigned') AS clergy, COALESCE(a.venue_name, 'Unassigned') AS venue,
      a.clergy_id AS clergyId, a.venue_id AS venueId,
      COALESCE(a.buffer_before_minutes, s.buffer_before_minutes, 0) AS bufferBefore,
      COALESCE(a.buffer_after_minutes, s.buffer_after_minutes, 0) AS bufferAfter,
      cr.kind, cr.status, a.status AS appointmentStatus, a.starts_at AS currentStartsAt,
      cr.proposed_starts_at AS proposedStartsAt, cr.proposed_ends_at AS proposedEndsAt,
      cr.reason, cr.decision_note AS decisionNote, du.full_name AS decidedBy,
      cr.created_at AS createdAt, cr.decided_at AS decidedAt
    FROM appointment_change_requests cr
    JOIN appointments a ON a.id = cr.appointment_id
    JOIN service_types s ON s.id = a.service_type_id
    JOIN parishes p ON p.id = a.parish_id
    LEFT JOIN users du ON du.id = cr.decided_by
    WHERE ${scope.sql}
      AND (cr.status = 'pending' OR datetime(COALESCE(cr.decided_at, cr.updated_at)) >= datetime('now', '-30 days'))
    ORDER BY CASE cr.status WHEN 'pending' THEN 0 ELSE 1 END, cr.created_at DESC
    LIMIT 100`).bind(...scope.values).all<Row>();

  return Promise.all(result.results.map(async (row) => {
    let proposedSlotAvailable: boolean | null = null;
    if (row.status === 'pending' && row.kind === 'reschedule' && row.proposedStartsAt && row.proposedEndsAt && row.clergyId && row.venueId) {
      const conflict = resourceConflict({
        blockedStart: new Date(new Date(row.proposedStartsAt).getTime() - Number(row.bufferBefore) * 60_000).toISOString(),
        blockedEnd: new Date(new Date(row.proposedEndsAt).getTime() + Number(row.bufferAfter) * 60_000).toISOString(),
        clergyId: row.clergyId, venueId: row.venueId, parishId: row.parishId, excludeAppointmentId: row.appointmentId,
      });
      const blocked = await db.prepare(`SELECT ${conflict.sql} AS blocked`).bind(...conflict.values).first<{ blocked: number }>();
      proposedSlotAvailable = !blocked?.blocked;
    }
    const restricted = actor.role === 'system_admin';
    return {
      id: row.id,
      appointmentId: row.appointmentId,
      reference: row.reference,
      // Parishioner identity is limited to parish personnel, consistent with the appointment list.
      parishioner: restricted ? 'Restricted parishioner' : row.parishioner,
      service: row.service,
      parishId: row.parishId,
      parish: row.parish,
      clergy: row.clergy,
      venue: row.venue,
      kind: row.kind,
      status: row.status,
      appointmentStatus: row.appointmentStatus as AppointmentStatus,
      currentStartsAt: row.currentStartsAt,
      proposedStartsAt: row.proposedStartsAt,
      proposedEndsAt: row.proposedEndsAt,
      reason: restricted ? 'Restricted' : row.reason,
      decisionNote: row.decisionNote,
      decidedBy: row.decidedBy,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      canDecide: row.status === 'pending' && canDecideChangeRequest(actor, { parishId: row.parishId, clergyId: row.clergyId }),
      proposedSlotAvailable,
    };
  }));
}
