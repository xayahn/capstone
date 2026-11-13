import { getRawDb } from '@/db/runtime';
import { AdminServiceError } from '@/backend/services/admin-error';
import { sha256Hex } from '@/backend/security/idempotency';
import { resourceConflict } from '@/shared/scheduling';
import { validPhoneNumber } from '@/shared/validation';
import {
  isUniqueConstraintError,
  shortAppointmentReference,
} from '@/shared/identifiers';
import type { Actor, AdminMutation } from '@/shared/domain';

export type WalkInIdempotencyContext = {
  keyHash: string;
  requestHash: string;
  expiresAt: string;
};

function canAccessParish(actor: Actor, parishId: string): boolean {
  return actor.role === 'system_admin' || actor.parishId === parishId;
}

async function existingIdempotency(actor: Actor, context: WalkInIdempotencyContext) {
  return getRawDb()
    .prepare(`SELECT request_hash AS requestHash FROM idempotency_keys
      WHERE actor_id = ? AND scope = 'admin.mutation' AND key_hash = ?
        AND datetime(expires_at) > datetime('now')`)
    .bind(actor.id, context.keyHash)
    .first<{ requestHash: string }>();
}

function idempotencyStatement(
  actor: Actor,
  context: WalkInIdempotencyContext,
  resourceId: string | null,
  conditionTable: 'appointment_events' | 'audit_logs',
  conditionId: string,
) {
  return getRawDb()
    .prepare(`INSERT INTO idempotency_keys
      (id, actor_id, scope, key_hash, request_hash, resource_id, response_status, expires_at)
      SELECT ?, ?, 'admin.mutation', ?, ?, ?, 200, ?
      WHERE EXISTS (SELECT 1 FROM ${conditionTable} WHERE id = ?)`)
    .bind(
      crypto.randomUUID(),
      actor.id,
      context.keyHash,
      context.requestHash,
      resourceId,
      context.expiresAt,
      conditionId,
    );
}

export async function cancelQueueTicket(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'queue.cancel' }>,
  idempotency: WalkInIdempotencyContext,
): Promise<void> {
  if (actor.role === 'clergy') {
    throw new AdminServiceError('Queue operations are limited to parish staff and system administrators.', 403);
  }
  const db = getRawDb();
  const row = await db
    .prepare(`SELECT id, ticket_number AS number,
        parishioner_user_id AS parishionerUserId, parish_id AS parishId, status
      FROM queue_tickets WHERE id = ?`)
    .bind(mutation.ticketId)
    .first<{
      id: string;
      number: string;
      parishionerUserId: string | null;
      parishId: string;
      status: string;
    }>();
  if (!row) throw new AdminServiceError('Queue ticket not found.', 404);
  if (!canAccessParish(actor, row.parishId)) {
    throw new AdminServiceError('You cannot operate this parish queue.', 403);
  }
  if (row.status !== 'waiting' && row.status !== 'serving') {
    throw new AdminServiceError('Only a waiting or currently serving ticket can be cancelled or marked no-show.', 409);
  }
  const auditId = crypto.randomUUID();
  const detail = mutation.status === 'no_show' ? 'Marked no-show at counter' : 'Cancelled by parish queue desk';
  const notificationTitle = mutation.status === 'no_show' ? 'Queue ticket marked no-show' : 'Queue ticket cancelled';
  const notificationBody =
    mutation.status === 'no_show'
      ? `${row.number} was marked no-show at the parish office. Request a new ticket if you still need assistance.`
      : `${row.number} was cancelled by the parish office.`;
  const results = await db.batch([
    db
      .prepare(`UPDATE queue_tickets SET status = ?, cancelled_at = datetime('now'),
        updated_at = datetime('now') WHERE id = ? AND status IN ('waiting','serving')`)
      .bind(mutation.status, row.id),
    db
      .prepare(`INSERT INTO audit_logs
        (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
        SELECT ?, ?, 'queue.cancel', 'queue_ticket', ?, ?, 'success', ? WHERE changes() = 1`)
      .bind(auditId, actor.id, row.id, row.parishId, detail),
    db
      .prepare(`INSERT INTO notifications
        (id, recipient_user_id, type, title, body, entity_type, entity_id)
        SELECT ?, ?, 'queue', ?, ?, 'queue_ticket', ?
        WHERE ? IS NOT NULL AND EXISTS (SELECT 1 FROM audit_logs WHERE id = ?)`)
      .bind(
        crypto.randomUUID(),
        row.parishionerUserId,
        notificationTitle,
        notificationBody,
        row.id,
        row.parishionerUserId,
        auditId,
      ),
    idempotencyStatement(actor, idempotency, row.id, 'audit_logs', auditId),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    const replay = await existingIdempotency(actor, idempotency);
    if (replay?.requestHash === idempotency.requestHash) return;
    throw new AdminServiceError('The ticket changed in another session. Refresh and try again.', 409);
  }
}

export async function createWalkInAppointment(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'walkin.appointment.create' }>,
  idempotency: WalkInIdempotencyContext,
): Promise<void> {
  if (actor.role !== 'parish_staff') {
    throw new AdminServiceError('Walk-in appointment booking requires assigned parish staff access.', 403);
  }
  if (actor.parishId !== mutation.parishId) {
    throw new AdminServiceError('You cannot book walk-in appointments for this parish.', 403);
  }
  const parishionerName = mutation.parishionerName.trim().replace(/\s+/g, ' ');
  if (parishionerName.length < 3 || parishionerName.length > 120) {
    throw new AdminServiceError('Enter the visitor’s complete name.');
  }
  const contactPhone = mutation.contactPhone ? mutation.contactPhone.trim() : null;
  if (contactPhone && !validPhoneNumber(contactPhone)) {
    throw new AdminServiceError('Enter a valid mobile or telephone number.');
  }
  const participantName = mutation.participantName ? mutation.participantName.trim().replace(/\s+/g, ' ') : null;
  if (participantName && (participantName.length < 2 || participantName.length > 160)) {
    throw new AdminServiceError('Enter a valid sacramental participant name.');
  }
  const start = new Date(mutation.startsAt);
  if (Number.isNaN(start.getTime())) {
    throw new AdminServiceError('Choose a valid appointment date and time.');
  }
  if (start.getTime() < Date.now() + 15 * 60_000) {
    throw new AdminServiceError('Choose a schedule at least 15 minutes from now.');
  }
  if (start.getTime() > Date.now() + 180 * 24 * 60 * 60_000) {
    throw new AdminServiceError('Choose a schedule within the next 180 days.');
  }

  const db = getRawDb();
  let linkedTicket: { id: string; number: string; parishId: string; parishionerUserId: string | null } | null = null;
  if (mutation.ticketId) {
    linkedTicket = await db
      .prepare(`SELECT id, ticket_number AS number, parish_id AS parishId,
          parishioner_user_id AS parishionerUserId
        FROM queue_tickets WHERE id = ?`)
      .bind(mutation.ticketId)
      .first<{
        id: string;
        number: string;
        parishId: string;
        parishionerUserId: string | null;
      }>();
    if (!linkedTicket) throw new AdminServiceError('Linked queue ticket not found.', 404);
    if (linkedTicket.parishId !== mutation.parishId) {
      throw new AdminServiceError('Linked queue ticket belongs to a different parish.', 409);
    }
  }

  const resource = await db
    .prepare(`SELECT s.duration_minutes AS durationMinutes,
        s.buffer_before_minutes AS bufferBeforeMinutes, s.buffer_after_minutes AS bufferAfterMinutes,
        cp.display_title AS clergyName, v.name AS venueName
      FROM service_types s
      JOIN clergy_profiles cp ON cp.id = ? AND cp.is_active = 1 AND EXISTS (SELECT 1 FROM users u WHERE u.id = cp.user_id AND u.is_active = 1)
        AND (cp.home_parish_id = ? OR cp.home_parish_id IS NULL)
      JOIN venues v ON v.id = ? AND v.parish_id = ? AND v.is_active = 1
      JOIN parishes p ON p.id = ? AND p.is_active = 1
      WHERE s.id = ? AND s.is_active = 1 LIMIT 1`)
    .bind(mutation.clergyId, mutation.parishId, mutation.venueId, mutation.parishId, mutation.parishId, mutation.serviceTypeId)
    .first<{
      durationMinutes: number;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
      clergyName: string;
      venueName: string;
    }>();
  if (!resource) {
    throw new AdminServiceError('Choose an active sacrament, priest, and venue for this parish.', 409);
  }

  const startsAt = start.toISOString();
  const endsAt = new Date(start.getTime() + Number(resource.durationMinutes) * 60_000).toISOString();
  const blockedStart = new Date(start.getTime() - Number(resource.bufferBeforeMinutes) * 60_000).toISOString();
  const blockedEnd = new Date(new Date(endsAt).getTime() + Number(resource.bufferAfterMinutes) * 60_000).toISOString();
  const requirements = await db
    .prepare(`SELECT id, name, instructions,
        is_required AS isRequired, updated_at AS updatedAt
      FROM document_requirements
      WHERE service_type_id = ? AND is_active = 1 ORDER BY sort_order, id`)
    .bind(mutation.serviceTypeId)
    .all<{ id: string; name: string; instructions: string | null; isRequired: number; updatedAt: string }>();
  const checklistVersionId = `chk_${(await sha256Hex(JSON.stringify(requirements.results))).slice(0, 24)}`;
  const conflict = resourceConflict({
    blockedStart,
    blockedEnd,
    clergyId: mutation.clergyId,
    venueId: mutation.venueId,
    parishId: mutation.parishId,
  });

  const existingParishionerId = linkedTicket?.parishionerUserId ?? null;
  const participants: Array<{ type: string; fullName: string; notes: string | null }> = [
    { type: 'requester', fullName: parishionerName, notes: contactPhone ? `Contact: ${contactPhone}` : null },
  ];
  if (participantName && participantName.toLowerCase() !== parishionerName.toLowerCase()) {
    participants.push({ type: 'recipient', fullName: participantName, notes: null });
  }

  let batchResults: Awaited<ReturnType<typeof db.batch>> | undefined;
  const appointmentInsertIndex = existingParishionerId ? 0 : 1;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const walkInUserId = existingParishionerId ?? crypto.randomUUID();
    const appointmentId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const reference = shortAppointmentReference();
    const statements: D1PreparedStatement[] = [];

    if (!existingParishionerId) {
      statements.push(
        db
          .prepare(`INSERT INTO users (id, email, full_name, role, home_parish_id, phone)
            SELECT ?, ?, ?, 'parishioner', ?, ? WHERE NOT ${conflict.sql}`)
          .bind(
            walkInUserId,
            `walkin.${walkInUserId}@walkin.parishlink.local`,
            parishionerName,
            mutation.parishId,
            contactPhone,
            ...conflict.values,
          ),
      );
    }

    statements.push(
      db
        .prepare(`INSERT INTO appointments
          (id, reference, parishioner_user_id, parishioner_name, service_type_id, checklist_version_id, parish_id,
            clergy_id, clergy_name, venue_id, venue_name, starts_at, ends_at, status,
            buffer_before_minutes, buffer_after_minutes)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?
          WHERE EXISTS (SELECT 1 FROM users WHERE id = ?) AND NOT ${conflict.sql}`)
        .bind(
          appointmentId,
          reference,
          walkInUserId,
          parishionerName,
          mutation.serviceTypeId,
          checklistVersionId,
          mutation.parishId,
          mutation.clergyId,
          resource.clergyName,
          mutation.venueId,
          resource.venueName,
          startsAt,
          endsAt,
          Number(resource.bufferBeforeMinutes),
          Number(resource.bufferAfterMinutes),
          walkInUserId,
          ...conflict.values,
        ),
      ...participants.map((participant) =>
        db
          .prepare(`INSERT INTO appointment_participants
            (id, appointment_id, participant_type, full_name, date_of_birth, notes)
            SELECT ?, ?, ?, ?, NULL, ? WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ?)`)
          .bind(crypto.randomUUID(), appointmentId, participant.type, participant.fullName, participant.notes, appointmentId),
      ),
      ...requirements.results.map((requirement) =>
        db
          .prepare(`INSERT INTO document_submissions
            (id, appointment_id, requirement_id, requirement_name, requirement_instructions,
              is_required, checklist_version_id, status)
            SELECT ?, ?, ?, ?, ?, ?, ?, 'not_submitted'
            WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ?)`)
          .bind(
            crypto.randomUUID(),
            appointmentId,
            requirement.id,
            requirement.name,
            requirement.instructions,
            requirement.isRequired,
            checklistVersionId,
            appointmentId,
          ),
      ),
      db
        .prepare(`INSERT INTO appointment_events
          (id, appointment_id, actor_id, event_type, to_status, detail)
          SELECT ?, ?, ?, 'request_submitted', 'submitted', ?
          WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ?)`)
        .bind(
          eventId,
          appointmentId,
          actor.id,
          linkedTicket ? `Booked at parish office from ticket ${linkedTicket.number}` : 'Booked at parish office for walk-in visitor',
          appointmentId,
        ),
    );

    if (existingParishionerId) {
      statements.push(
        db
          .prepare(`INSERT INTO notifications
            (id, recipient_user_id, type, title, body, entity_type, entity_id)
            SELECT ?, ?, 'appointment', 'Appointment booked at parish office', ?, 'appointment', ?
            WHERE EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
          .bind(
            crypto.randomUUID(),
            existingParishionerId,
            `${reference} was recorded at the parish office for parish review.`,
            appointmentId,
            eventId,
          ),
      );
    }

    statements.push(
      db
        .prepare(`INSERT INTO audit_logs
          (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
          SELECT ?, ?, 'walkin.appointment.create', 'appointment', ?, ?, 'success', ?
          WHERE EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
        .bind(
          crypto.randomUUID(),
          actor.id,
          appointmentId,
          mutation.parishId,
          `${mutation.serviceTypeId}; ${startsAt}${linkedTicket ? `; ticket=${linkedTicket.number}` : ''}`,
          eventId,
        ),
      idempotencyStatement(actor, idempotency, appointmentId, 'appointment_events', eventId),
    );

    try {
      batchResults = await db.batch(statements);
      break;
    } catch (error) {
      const replay = await existingIdempotency(actor, idempotency);
      if (replay?.requestHash === idempotency.requestHash) return;
      if (attempt < 2 && isUniqueConstraintError(error)) continue;
      throw error;
    }
  }

  if (!batchResults || Number(batchResults[appointmentInsertIndex]?.meta.changes ?? 0) !== 1) {
    const replay = await existingIdempotency(actor, idempotency);
    if (replay?.requestHash === idempotency.requestHash) return;
    throw new AdminServiceError(
      'That priest or venue already has an overlapping appointment or assignment for the full service window (including buffers).',
      409,
    );
  }
}
