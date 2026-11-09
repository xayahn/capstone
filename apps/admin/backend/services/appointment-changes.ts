import { getRawDb } from '@/db/runtime';
import { MobileServiceError, type MobileActor } from '@/backend/auth/mobile-auth';
import { loadMobileAppointment, startsAtFromInput } from '@/backend/services/mobile-service';
import { parishionerChangeOptions, PRE_APPROVAL_STATUSES } from '@/shared/change-policy';
import { resourceConflict } from '@/shared/scheduling';
import type { AppointmentStatus } from '@/shared/domain';

/**
 * Parishioner-initiated cancellation and reschedule requests (mobile app).
 * Decisions by parish personnel live in admin-service (`change_request.decide`).
 */

type OwnedAppointment = {
  id: string;
  reference: string;
  parishId: string;
  clergyId: string | null;
  venueId: string | null;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  version: number;
  bufferBefore: number;
  bufferAfter: number;
  pendingId: string | null;
  pendingKind: 'reschedule' | 'cancel' | null;
};

async function ownedAppointment(actor: MobileActor, appointmentId: string): Promise<OwnedAppointment> {
  if (typeof appointmentId !== 'string' || !appointmentId || appointmentId.length > 100) throw new MobileServiceError('Invalid appointment reference.');
  const row = await getRawDb().prepare(`SELECT a.id, a.reference, a.parish_id AS parishId, a.clergy_id AS clergyId, a.venue_id AS venueId,
      a.status, a.starts_at AS startsAt, a.ends_at AS endsAt, a.version,
      COALESCE(a.buffer_before_minutes, s.buffer_before_minutes, 0) AS bufferBefore,
      COALESCE(a.buffer_after_minutes, s.buffer_after_minutes, 0) AS bufferAfter,
      cr.id AS pendingId, cr.kind AS pendingKind
    FROM appointments a
    JOIN service_types s ON s.id = a.service_type_id
    LEFT JOIN appointment_change_requests cr ON cr.appointment_id = a.id AND cr.status = 'pending'
    WHERE a.id = ? AND a.parishioner_user_id = ?`).bind(appointmentId, actor.id).first<OwnedAppointment>();
  // Not distinguishing "missing" from "someone else's" avoids revealing other parishioners' references.
  if (!row) throw new MobileServiceError('Appointment not found.', 404);
  return { ...row, version: Number(row.version), bufferBefore: Number(row.bufferBefore), bufferAfter: Number(row.bufferAfter) };
}

function reasonField(value: unknown): string {
  const reason = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (reason.length < 4) throw new MobileServiceError('Give a short reason so the parish office understands your request.');
  if (reason.length > 500) throw new MobileServiceError('Keep the reason under 500 characters.');
  return reason;
}

/**
 * Cancel an appointment. Before approval the cancellation is immediate; after
 * approval a cancellation request is sent to the parish. Returns the updated appointment.
 */
export async function cancelMobileAppointment(actor: MobileActor, appointmentId: string, input: Record<string, unknown>) {
  const appointment = await ownedAppointment(actor, appointmentId);
  // A retried request after a successful cancellation returns the same result.
  if (appointment.status === 'cancelled') return loadMobileAppointment(actor, appointment.id);
  if (appointment.pendingKind === 'cancel') return loadMobileAppointment(actor, appointment.id);
  const reason = reasonField(input.reason);
  const options = parishionerChangeOptions(appointment.status, appointment.startsAt, Boolean(appointment.pendingId));
  const db = getRawDb();
  const eventId = crypto.randomUUID();

  if (options.cancel === 'immediate') {
    const results = await db.batch([
      db.prepare(`UPDATE appointments SET status = 'cancelled', review_note = ?, version = version + 1, updated_at = datetime('now')
        WHERE id = ? AND version = ? AND status IN (${PRE_APPROVAL_STATUSES.map(() => '?').join(',')})`)
        .bind(`Cancelled by parishioner: ${reason}`, appointment.id, appointment.version, ...PRE_APPROVAL_STATUSES),
      db.prepare(`INSERT INTO appointment_events (id, appointment_id, actor_id, event_type, from_status, to_status, detail)
        SELECT ?, ?, ?, 'cancelled_by_parishioner', ?, 'cancelled', ? WHERE changes() = 1`)
        .bind(eventId, appointment.id, actor.id, appointment.status, reason),
      db.prepare(`UPDATE appointment_change_requests SET status = 'withdrawn', decision_note = 'Appointment cancelled by the parishioner',
          decided_at = datetime('now'), updated_at = datetime('now')
        WHERE appointment_id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`).bind(appointment.id, eventId),
      db.prepare(`INSERT INTO notifications (id, recipient_user_id, type, title, body, entity_type, entity_id)
        SELECT ?, ?, 'appointment', 'Appointment cancelled', ?, 'appointment', ? WHERE EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
        .bind(crypto.randomUUID(), actor.id, `${appointment.reference} was cancelled at your request.`, appointment.id, eventId),
      db.prepare(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
        SELECT ?, ?, 'mobile.appointment.cancel', 'appointment', ?, ?, 'success', ? WHERE EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
        .bind(crypto.randomUUID(), actor.id, appointment.id, appointment.parishId, `${appointment.status} -> cancelled: ${reason}`, eventId),
    ]);
    if (Number(results[0]?.meta.changes ?? 0) < 1) throw new MobileServiceError('This appointment changed in the meantime. Refresh and try again.', 409);
    return loadMobileAppointment(actor, appointment.id);
  }

  if (options.cancel === 'request') {
    const requestId = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare(`INSERT INTO appointment_change_requests (id, appointment_id, kind, requested_by, previous_starts_at, previous_ends_at, reason)
          SELECT ?, ?, 'cancel', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ? AND status = 'approved')`)
          .bind(requestId, appointment.id, actor.id, appointment.startsAt, appointment.endsAt, reason, appointment.id),
        db.prepare(`INSERT INTO appointment_events (id, appointment_id, actor_id, event_type, detail)
          SELECT ?, ?, ?, 'cancellation_requested', ? WHERE EXISTS (SELECT 1 FROM appointment_change_requests WHERE id = ?)`)
          .bind(eventId, appointment.id, actor.id, reason, requestId),
        db.prepare(`INSERT INTO notifications (id, recipient_user_id, type, title, body, entity_type, entity_id)
          SELECT ?, ?, 'appointment', 'Cancellation request sent', ?, 'appointment', ? WHERE EXISTS (SELECT 1 FROM appointment_change_requests WHERE id = ?)`)
          .bind(crypto.randomUUID(), actor.id, `Your request to cancel ${appointment.reference} was sent to the parish office. The appointment stays scheduled until the parish confirms.`, appointment.id, requestId),
        db.prepare(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
          SELECT ?, ?, 'mobile.change_request.cancel', 'appointment', ?, ?, 'success', ? WHERE EXISTS (SELECT 1 FROM appointment_change_requests WHERE id = ?)`)
          .bind(crypto.randomUUID(), actor.id, appointment.id, appointment.parishId, reason, requestId),
      ]);
    } catch (error) {
      if (String(error).toLowerCase().includes('unique')) throw new MobileServiceError('A request for this appointment is already waiting for the parish.', 409);
      throw error;
    }
    return loadMobileAppointment(actor, appointment.id);
  }

  throw new MobileServiceError(appointment.pendingId
    ? 'A request for this appointment is already waiting for the parish.'
    : 'This appointment can no longer be cancelled in the app. Please contact the parish office.', 409);
}

/** Ask the parish to move an appointment to a new time (same priest and venue). */
export async function requestMobileReschedule(actor: MobileActor, appointmentId: string, input: Record<string, unknown>) {
  const appointment = await ownedAppointment(actor, appointmentId);
  const reason = reasonField(input.reason);
  const options = parishionerChangeOptions(appointment.status, appointment.startsAt, Boolean(appointment.pendingId));
  if (!options.reschedule) {
    throw new MobileServiceError(appointment.pendingId
      ? 'A request for this appointment is already waiting for the parish.'
      : 'This appointment can no longer be rescheduled in the app. Reschedule requests must be made at least 24 hours ahead.', 409);
  }
  if (!appointment.clergyId || !appointment.venueId) throw new MobileServiceError('This appointment has no assigned priest or venue yet. Please contact the parish office.', 409);
  const date = typeof input.date === 'string' ? input.date.trim() : '';
  const time = typeof input.time === 'string' ? input.time.trim() : '';
  const proposedStart = startsAtFromInput(date, time);
  const durationMs = new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime();
  const proposedEnd = new Date(proposedStart.getTime() + durationMs);
  if (proposedStart.toISOString() === new Date(appointment.startsAt).toISOString()) throw new MobileServiceError('Choose a different date or time from your current schedule.');

  // Early feedback only; the decisive conflict check runs again atomically when the parish approves.
  const db = getRawDb();
  const conflict = resourceConflict({
    blockedStart: new Date(proposedStart.getTime() - appointment.bufferBefore * 60_000).toISOString(),
    blockedEnd: new Date(proposedEnd.getTime() + appointment.bufferAfter * 60_000).toISOString(),
    clergyId: appointment.clergyId, venueId: appointment.venueId, parishId: appointment.parishId,
    excludeAppointmentId: appointment.id,
  });
  const blocked = await db.prepare(`SELECT ${conflict.sql} AS blocked`).bind(...conflict.values).first<{ blocked: number }>();
  if (blocked?.blocked) throw new MobileServiceError('That time is no longer available for the same priest and venue. Choose another slot.', 409);

  const requestId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const when = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }).format(proposedStart);
  try {
    await db.batch([
      db.prepare(`INSERT INTO appointment_change_requests (id, appointment_id, kind, requested_by, previous_starts_at, previous_ends_at,
          proposed_starts_at, proposed_ends_at, reason)
        SELECT ?, ?, 'reschedule', ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ? AND version = ?)`)
        .bind(requestId, appointment.id, actor.id, appointment.startsAt, appointment.endsAt, proposedStart.toISOString(), proposedEnd.toISOString(), reason, appointment.id, appointment.version),
      db.prepare(`INSERT INTO appointment_events (id, appointment_id, actor_id, event_type, detail)
        SELECT ?, ?, ?, 'reschedule_requested', ? WHERE EXISTS (SELECT 1 FROM appointment_change_requests WHERE id = ?)`)
        .bind(eventId, appointment.id, actor.id, `Requested ${proposedStart.toISOString()}: ${reason}`, requestId),
      db.prepare(`INSERT INTO notifications (id, recipient_user_id, type, title, body, entity_type, entity_id)
        SELECT ?, ?, 'appointment', 'Reschedule request sent', ?, 'appointment', ? WHERE EXISTS (SELECT 1 FROM appointment_change_requests WHERE id = ?)`)
        .bind(crypto.randomUUID(), actor.id, `Your request to move ${appointment.reference} to ${when} was sent to the parish office. Your current schedule stays in place until the parish approves.`, appointment.id, requestId),
      db.prepare(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
        SELECT ?, ?, 'mobile.change_request.reschedule', 'appointment', ?, ?, 'success', ? WHERE EXISTS (SELECT 1 FROM appointment_change_requests WHERE id = ?)`)
        .bind(crypto.randomUUID(), actor.id, appointment.id, appointment.parishId, `${appointment.startsAt} -> ${proposedStart.toISOString()}: ${reason}`, requestId),
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) throw new MobileServiceError('A request for this appointment is already waiting for the parish.', 409);
    throw error;
  }
  const saved = await db.prepare('SELECT 1 AS present FROM appointment_change_requests WHERE id = ?').bind(requestId).first<{ present: number }>();
  if (!saved) throw new MobileServiceError('This appointment changed in the meantime. Refresh and try again.', 409);
  return loadMobileAppointment(actor, appointment.id);
}

/** Withdraw the parishioner's own pending request. */
export async function withdrawMobileChangeRequest(actor: MobileActor, appointmentId: string) {
  const appointment = await ownedAppointment(actor, appointmentId);
  if (!appointment.pendingId) return loadMobileAppointment(actor, appointment.id);
  const db = getRawDb();
  await db.batch([
    db.prepare(`UPDATE appointment_change_requests SET status = 'withdrawn', decision_note = 'Withdrawn by the parishioner',
        decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'pending' AND requested_by = ?`)
      .bind(appointment.pendingId, actor.id),
    db.prepare(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      SELECT ?, ?, 'mobile.change_request.withdraw', 'appointment', ?, ?, 'success', ? WHERE changes() = 1`)
      .bind(crypto.randomUUID(), actor.id, appointment.id, appointment.parishId, `${appointment.pendingKind} request withdrawn`),
  ]);
  return loadMobileAppointment(actor, appointment.id);
}
