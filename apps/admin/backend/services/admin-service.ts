import type { StaffIdentity } from '@/backend/auth/staff-auth';
import { ensureRuntimeDatabase, getRawDb } from '@/db/runtime';
import { sha256Hex } from '@/backend/security/idempotency';
import {
  APPOINTMENT_STATUSES,
  INTERNAL_USER_ROLES,
  type Actor,
  type AdminMutation,
  type Appointment,
  type AppointmentDocument,
  type AppointmentStatus,
  type Announcement,
  type ClergyAssignment,
  type DashboardState,
  type InternalUserRole,
  type ParishRecord,
  type QueueTicket,
} from '@/shared/domain';
import { allowedAppointmentTransitions } from '@/shared/workflow';
import { TERMINAL_STATUSES } from '@/shared/change-policy';
import { occupiedStart, occupiedEnd, resourceConflict, NON_BLOCKING_APPOINTMENT_STATUSES_SQL } from '@/shared/scheduling';
import { canDecideChangeRequest, loadChangeRequests } from '@/backend/services/change-requests';
import { generateDueReminders } from '@/backend/services/reminders';
import { recordServerFailure } from '@/backend/observability/server-log';
import { validCalendarDate } from '@/shared/validation';
import { scoped } from '@/backend/services/admin-scope';
import { loadDashboardMetrics } from '@/backend/services/dashboard-metrics';
import { AdminServiceError } from '@/backend/services/admin-error';
import {
  createRequirementSetting,
  loadParishProfiles,
  loadServiceSettings,
  updateParishProfile,
  updateRequirementSetting,
  updateServiceSetting,
} from '@/backend/services/settings-service';

export { AdminServiceError };

type ActorRow = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  parishId: string | null;
  parishName: string | null;
  clergyProfileId: string | null;
  isActive: number;
};

type AppointmentRow = Omit<Appointment, 'verifiedDocuments' | 'requiredDocuments' | 'conflict' | 'version'> & {
  verifiedDocuments: number | string;
  requiredDocuments: number | string;
  conflict: number;
  version: number | string;
};

type AppointmentAccessRow = {
  id: string;
  reference: string;
  parishionerUserId: string;
  parishId: string;
  clergyId: string | null;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  venueId: string | null;
  serviceTypeId: string;
  version: number;
};

/** Minimal identity needed to resolve an actor; produced by the staff session cookie. */
export type ActorIdentity = Pick<StaffIdentity, 'userId' | 'email' | 'mustChangePassword'>;

export async function resolveActor(identity: ActorIdentity): Promise<Actor> {
  if (identity.mustChangePassword) {
    throw new AdminServiceError('Change your temporary password before using the portal.', 403);
  }
  await ensureRuntimeDatabase();
  const db = getRawDb();
  const row = await db.prepare(`SELECT
      u.id AS id, u.full_name AS fullName, u.email AS email, u.role AS role,
      u.home_parish_id AS parishId, p.name AS parishName,
      cp.id AS clergyProfileId, u.is_active AS isActive
    FROM users u
    LEFT JOIN parishes p ON p.id = u.home_parish_id
    LEFT JOIN clergy_profiles cp ON cp.user_id = u.id AND cp.is_active = 1
    WHERE u.id = ?
    LIMIT 1`)
    .bind(identity.userId)
    .first<ActorRow>();

  if (!row || !row.isActive) throw new AdminServiceError('Your ParishLink access is inactive or has not been provisioned.', 403);
  if (!INTERNAL_USER_ROLES.includes(row.role as InternalUserRole)) {
    throw new AdminServiceError('The administrative portal is limited to authorized parish personnel.', 403);
  }
  if (row.role !== 'system_admin' && !row.parishId) {
    throw new AdminServiceError('Your account needs an assigned parish before it can use this portal.', 403);
  }

  if (!row.email || row.email.toLowerCase() !== identity.email.toLowerCase()) {
    throw new AdminServiceError('The signed-in identity does not match the provisioned account.', 403);
  }

  return {
    id: row.id,
    name: row.fullName,
    email: row.email,
    role: row.role as InternalUserRole,
    parishId: row.parishId,
    parishName: row.parishName ?? 'Vicariate-wide',
    clergyProfileId: row.clergyProfileId,
  };
}

export async function loadDashboardState(actor: Actor): Promise<DashboardState> {
  const db = getRawDb();
  const appointmentScope = scoped('a', actor, true);
  const parishScope = scoped('q', actor);
  // No purpose-grant model exists yet: restricted records default to parish staff only.
  const recordScope = actor.role === 'parish_staff' ? scoped('r', actor) : { sql: '0 = 1', values: [] };
  const assignmentScope = actor.role === 'clergy' ? scoped('ca', actor, true) : scoped('ca', actor);

  const appointmentQuery = db.prepare(`SELECT
      a.id AS id, a.reference AS reference, a.parishioner_name AS parishioner,
      s.name AS service, a.parish_id AS parishId, p.name AS parish,
      COALESCE(a.clergy_name, 'Unassigned') AS clergy,
      COALESCE(a.venue_name, 'Unassigned') AS venue,
      COALESCE((SELECT GROUP_CONCAT(ap.full_name, ', ') FROM appointment_participants ap
        WHERE ap.appointment_id = a.id), a.parishioner_name) AS participants,
      a.starts_at AS startsAt, a.ends_at AS endsAt, a.status AS status,
      a.review_note AS reviewNote, a.version AS version,
      (SELECT COUNT(*) FROM document_submissions ds
        WHERE ds.appointment_id = a.id AND ds.is_required = 1) AS requiredDocuments,
      (SELECT COUNT(*) FROM document_submissions ds
        WHERE ds.appointment_id = a.id AND ds.is_required = 1 AND ds.status = 'verified') AS verifiedDocuments,
      CASE WHEN EXISTS (
        SELECT 1 FROM appointments other
        WHERE other.id <> a.id
          AND other.status NOT IN ('rejected','completed','cancelled','no_show')
          AND ${occupiedStart('other')} < ${occupiedEnd('a')} AND ${occupiedEnd('other')} > ${occupiedStart('a')}
          AND ((a.clergy_id IS NOT NULL AND other.clergy_id = a.clergy_id)
            OR (a.venue_id IS NOT NULL AND other.venue_id = a.venue_id))
      ) OR EXISTS (
        SELECT 1 FROM clergy_assignments block
        WHERE block.status = 'confirmed' AND datetime(block.starts_at) < ${occupiedEnd('a')} AND datetime(block.ends_at) > ${occupiedStart('a')}
          AND ((a.clergy_id IS NOT NULL AND block.clergy_id = a.clergy_id)
            OR (a.venue_id IS NOT NULL AND block.venue_id = a.venue_id))
          AND NOT (block.starts_at = a.starts_at AND block.ends_at = a.ends_at
            AND COALESCE(block.venue_id, '') = COALESCE(a.venue_id, ''))
      ) THEN 1 ELSE 0 END AS conflict
    FROM appointments a
    JOIN parishes p ON p.id = a.parish_id
    JOIN service_types s ON s.id = a.service_type_id
    WHERE ${appointmentScope.sql}
    ORDER BY a.starts_at ASC, a.created_at ASC`).bind(...appointmentScope.values);

  const documentQuery = db.prepare(`SELECT
      ds.id AS id, ds.requirement_id AS requirementId,
      a.id AS appointmentId, a.reference AS reference, a.parishioner_name AS parishioner,
      s.name AS service, ds.requirement_name AS requirement, ds.original_file_name AS fileName,
      ds.status AS status, ds.review_note AS reviewNote,
      ds.submitted_at AS submittedAt, ds.sha256 AS sha256
    FROM appointments a
    JOIN service_types s ON s.id = a.service_type_id
    JOIN document_submissions ds ON ds.appointment_id = a.id
    WHERE ${actor.role === 'parish_staff' ? appointmentScope.sql : '0 = 1'}
    ORDER BY a.starts_at ASC, ds.created_at ASC`).bind(...(actor.role === 'parish_staff' ? appointmentScope.values : []));

  const queueQuery = db.prepare(`SELECT q.id AS id, q.ticket_number AS number, q.parish_id AS parishId,
      p.name AS parish, q.service AS service, q.parishioner_name AS parishioner,
      q.status AS status, q.priority AS priority, q.issued_at AS issuedAt,
      q.called_at AS calledAt, q.counter AS counter
    FROM queue_tickets q JOIN parishes p ON p.id = q.parish_id
    WHERE ${actor.role === 'clergy' ? '0 = 1' : parishScope.sql}
      AND status IN ('waiting','serving')
    ORDER BY CASE status WHEN 'serving' THEN 0 ELSE 1 END, priority DESC, issued_at ASC`).bind(
      ...(actor.role === 'clergy' ? [] : parishScope.values),
    );

  const announcementValues: string[] = [];
  let announcementScope = '1 = 1';
  if (actor.role !== 'system_admin') {
    announcementScope = '(an.parish_id IS NULL OR an.parish_id = ?)';
    announcementValues.push(actor.parishId as string);
  }
  const announcementQuery = db.prepare(`SELECT an.id AS id, an.title AS title, an.body AS body,
      an.audience AS audience, COALESCE(p.name, 'Vicariate-wide') AS parish,
      an.published_at AS publishedAt, u.full_name AS author
    FROM announcements an
    JOIN users u ON u.id = an.author_id
    LEFT JOIN parishes p ON p.id = an.parish_id
    WHERE ${announcementScope} AND an.status = 'published'
    ORDER BY an.published_at DESC LIMIT 20`).bind(...announcementValues);

  const recordQuery = db.prepare(`SELECT r.id AS id, r.record_type AS type,
      r.subject_name AS subject, p.name AS parish, r.event_date AS eventDate,
      r.reference AS reference, r.status AS status
    FROM sacramental_records r JOIN parishes p ON p.id = r.parish_id
    WHERE ${recordScope.sql}
    ORDER BY r.event_date DESC LIMIT 100`).bind(...recordScope.values);

  const assignmentQuery = db.prepare(`SELECT ca.id AS id, ca.clergy_name AS clergy,
      p.name AS parish, ca.venue_name AS venue, ca.service AS service,
      ca.starts_at AS startsAt, ca.ends_at AS endsAt
    FROM clergy_assignments ca JOIN parishes p ON p.id = ca.parish_id
    WHERE ${assignmentScope.sql} AND ca.status = 'confirmed'
    ORDER BY ca.starts_at ASC LIMIT 100`).bind(...assignmentScope.values);

  const parishQuery = actor.role === 'system_admin'
    ? db.prepare('SELECT id, name FROM parishes WHERE is_active = 1 ORDER BY name')
    : db.prepare('SELECT id, name FROM parishes WHERE id = ? AND is_active = 1').bind(actor.parishId);

  const clergyOptionQuery = actor.role === 'system_admin'
    ? db.prepare(`SELECT id, display_title AS name, home_parish_id AS parishId
        FROM clergy_profiles WHERE is_active = 1 AND EXISTS (SELECT 1 FROM users u WHERE u.id = clergy_profiles.user_id AND u.is_active = 1) ORDER BY display_title`)
    : db.prepare(`SELECT id, display_title AS name, home_parish_id AS parishId
        FROM clergy_profiles WHERE is_active = 1 AND EXISTS (SELECT 1 FROM users u WHERE u.id = clergy_profiles.user_id AND u.is_active = 1) AND home_parish_id = ? ORDER BY display_title`).bind(actor.parishId);
  const venueOptionQuery = actor.role === 'system_admin'
    ? db.prepare(`SELECT id, name, parish_id AS parishId, capacity FROM venues WHERE is_active = 1 ORDER BY name`)
    : db.prepare(`SELECT id, name, parish_id AS parishId, capacity FROM venues
        WHERE is_active = 1 AND parish_id = ? ORDER BY name`).bind(actor.parishId);
  const accessUserQuery = actor.role === 'system_admin'
    ? db.prepare(`SELECT u.id, u.full_name AS name, u.email, u.role,
        COALESCE(p.name, 'Vicariate-wide') AS parish, u.is_active AS isActive
      FROM users u LEFT JOIN parishes p ON p.id = u.home_parish_id
      WHERE u.role IN ('parish_staff','clergy','system_admin') ORDER BY u.full_name`)
    : db.prepare(`SELECT u.id, u.full_name AS name, u.email, u.role,
        COALESCE(p.name, 'Vicariate-wide') AS parish, u.is_active AS isActive
      FROM users u LEFT JOIN parishes p ON p.id = u.home_parish_id WHERE 0 = 1`);

  // Portal loads also create any due parishioner reminders (local deployment has no scheduler).
  await generateDueReminders().catch((error) => {
    recordServerFailure('reminder-generation', error);
    return 0;
  });
  const [appointmentsResult, documentsResult, queueResult, announcementsResult, recordsResult, assignmentsResult, parishesResult, clergyOptionsResult, venueOptionsResult, accessUsersResult, metrics, changeRequests, parishProfiles, serviceSettings] = await Promise.all([
    appointmentQuery.all<AppointmentRow>(),
    documentQuery.all<AppointmentDocument>(),
    queueQuery.all<QueueTicket>(),
    announcementQuery.all<Announcement>(),
    recordQuery.all<ParishRecord>(),
    assignmentQuery.all<ClergyAssignment>(),
    parishQuery.all<{ id: string; name: string }>(),
    clergyOptionQuery.all<{ id: string; name: string; parishId: string | null }>(),
    venueOptionQuery.all<{ id: string; name: string; parishId: string; capacity: number | null }>(),
    accessUserQuery.all<{ id: string; name: string; email: string; role: InternalUserRole; parish: string; isActive: number }>(),
    loadDashboardMetrics(actor),
    loadChangeRequests(actor),
    loadParishProfiles(actor),
    loadServiceSettings(),
  ]);

  const appointments: Appointment[] = appointmentsResult.results.map((row) => ({
    ...row,
    ...(actor.role === 'system_admin' ? { parishioner: 'Restricted parishioner', participants: 'Restricted', reviewNote: null } : {}),
    verifiedDocuments: Number(row.verifiedDocuments),
    requiredDocuments: Number(row.requiredDocuments),
    conflict: Boolean(row.conflict),
    version: Number(row.version),
  }));

  return {
    actor,
    parishes: parishesResult.results,
    parishProfiles,
    serviceSettings,
    clergyOptions: clergyOptionsResult.results,
    venueOptions: venueOptionsResult.results.map((item) => ({
      ...item,
      capacity: item.capacity === null || item.capacity === undefined ? null : Number(item.capacity),
    })),
    accessUsers: accessUsersResult.results.map((item) => ({ ...item, isActive: Boolean(item.isActive) })),
    appointments,
    documents: documentsResult.results,
    queue: queueResult.results,
    announcements: announcementsResult.results,
    records: recordsResult.results,
    clergyAssignments: assignmentsResult.results,
    changeRequests,
    metrics,
    generatedAt: new Date().toISOString(),
    // Local development always runs on seeded synthetic demonstration data.
    source: process.env.NODE_ENV === 'production' ? 'd1' : 'demo',
  };
}

function canAccessAppointment(actor: Actor, appointment: Pick<AppointmentAccessRow, 'parishId' | 'clergyId'>): boolean {
  if (actor.role === 'system_admin') return true;
  if (actor.role === 'clergy') return Boolean(actor.clergyProfileId && actor.clergyProfileId === appointment.clergyId);
  return Boolean(actor.parishId && actor.parishId === appointment.parishId);
}

async function getAppointment(id: string): Promise<AppointmentAccessRow> {
  const row = await getRawDb().prepare(`SELECT id, reference, parishioner_user_id AS parishionerUserId,
    parish_id AS parishId, clergy_id AS clergyId,
    status, starts_at AS startsAt, ends_at AS endsAt, venue_id AS venueId,
    service_type_id AS serviceTypeId, version
    FROM appointments WHERE id = ?`).bind(id).first<AppointmentAccessRow>();
  if (!row) throw new AdminServiceError('Appointment not found.', 404);
  return row;
}

type AdminIdempotencyContext = {
  keyHash: string;
  requestHash: string;
  expiresAt: string;
};

async function existingAdminIdempotency(actor: Actor, context: AdminIdempotencyContext) {
  return getRawDb().prepare(`SELECT request_hash AS requestHash FROM idempotency_keys
    WHERE actor_id = ? AND scope = 'admin.mutation' AND key_hash = ?
      AND datetime(expires_at) > datetime('now')`)
    .bind(actor.id, context.keyHash).first<{ requestHash: string }>();
}

async function prepareAdminIdempotency(
  actor: Actor,
  mutation: AdminMutation,
  key: string,
): Promise<AdminIdempotencyContext | null> {
  const context = {
    keyHash: await sha256Hex(key),
    requestHash: await sha256Hex(JSON.stringify(mutation)),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  await getRawDb().prepare(`DELETE FROM idempotency_keys
    WHERE actor_id = ? AND scope = 'admin.mutation' AND key_hash = ?
      AND datetime(expires_at) <= datetime('now')`).bind(actor.id, context.keyHash).run();
  const existing = await existingAdminIdempotency(actor, context);
  if (!existing) return context;
  if (existing.requestHash !== context.requestHash) {
    throw new AdminServiceError('That Idempotency-Key was already used for a different administrative action.', 409);
  }
  return null;
}

function adminIdempotencyStatement(
  actor: Actor,
  context: AdminIdempotencyContext,
  resourceId: string | null,
  conditionTable: 'appointment_events' | 'audit_logs' | 'announcements',
  conditionId: string,
) {
  return getRawDb().prepare(`INSERT INTO idempotency_keys
    (id, actor_id, scope, key_hash, request_hash, resource_id, response_status, expires_at)
    SELECT ?, ?, 'admin.mutation', ?, ?, ?, 200, ?
    WHERE EXISTS (SELECT 1 FROM ${conditionTable} WHERE id = ?)`)
    .bind(crypto.randomUUID(), actor.id, context.keyHash, context.requestHash,
      resourceId, context.expiresAt, conditionId);
}

async function finishAdminIdempotency(
  actor: Actor,
  context: AdminIdempotencyContext,
  resourceId: string | null = null,
): Promise<void> {
  await getRawDb().prepare(`INSERT OR IGNORE INTO idempotency_keys
    (id, actor_id, scope, key_hash, request_hash, resource_id, response_status, expires_at)
    VALUES (?, ?, 'admin.mutation', ?, ?, ?, 200, ?)`)
    .bind(crypto.randomUUID(), actor.id, context.keyHash, context.requestHash, resourceId, context.expiresAt).run();
  const existing = await existingAdminIdempotency(actor, context);
  if (!existing || existing.requestHash !== context.requestHash) {
    throw new AdminServiceError('The action completed, but its retry safeguard could not be confirmed. Refresh before trying again.', 409);
  }
}

async function writeAudit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  parishId: string | null,
  outcome: 'success' | 'denied',
  detail: string,
): Promise<void> {
  await getRawDb().prepare(`INSERT INTO audit_logs
    (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), actor.id, action, entityType, entityId, parishId, outcome, detail.slice(0, 1000))
    .run();
}

async function transitionAppointment(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'appointment.transition' }>,
  idempotency: AdminIdempotencyContext,
): Promise<void> {
  const current = await getAppointment(mutation.appointmentId);
  if (!canAccessAppointment(actor, current)) throw new AdminServiceError('You cannot access this appointment.', 403);
  if (!APPOINTMENT_STATUSES.includes(mutation.status)) throw new AdminServiceError('Unknown appointment status.');
  if (!allowedAppointmentTransitions(current.status, actor.role).includes(mutation.status)) {
    throw new AdminServiceError(`The ${current.status.replaceAll('_', ' ')} appointment cannot move to ${mutation.status.replaceAll('_', ' ')} for your role.`, 409);
  }
  const reason = mutation.reason?.trim() ?? '';
  if (['needs_changes', 'rejected', 'cancelled'].includes(mutation.status) && reason.length < 4) {
    throw new AdminServiceError('Provide a short reason so the parishioner and audit history are clear.');
  }

  const gateRequired = mutation.status === 'ready_to_approve' || mutation.status === 'approved';
  const gateSql = gateRequired ? `AND EXISTS (
        SELECT 1 FROM parishes p WHERE p.id = appointments.parish_id AND p.is_active = 1
      ) AND EXISTS (
        SELECT 1 FROM service_types s WHERE s.id = appointments.service_type_id AND s.is_active = 1
      ) AND EXISTS (
        SELECT 1 FROM clergy_profiles cp JOIN users u ON u.id = cp.user_id
        WHERE cp.id = appointments.clergy_id AND cp.is_active = 1 AND u.is_active = 1
      ) AND EXISTS (
        SELECT 1 FROM venues v WHERE v.id = appointments.venue_id AND v.is_active = 1
      ) AND NOT EXISTS (
        SELECT 1 FROM availability_blocks ab
        WHERE datetime(ab.starts_at) < ${occupiedEnd('appointments')} AND datetime(ab.ends_at) > ${occupiedStart('appointments')}
          AND (ab.clergy_id = appointments.clergy_id OR ab.venue_id = appointments.venue_id
            OR (ab.clergy_id IS NULL AND ab.venue_id IS NULL AND ab.parish_id = appointments.parish_id))
      ) AND NOT EXISTS (
        SELECT 1 FROM document_submissions ds
        WHERE ds.appointment_id = appointments.id AND ds.is_required = 1 AND ds.status <> 'verified'
      )
      AND NOT EXISTS (
        SELECT 1 FROM appointments other
        WHERE other.id <> appointments.id
          AND other.status NOT IN ('rejected','completed','cancelled','no_show')
          AND ${occupiedStart('other')} < ${occupiedEnd('appointments')} AND ${occupiedEnd('other')} > ${occupiedStart('appointments')}
          AND ((appointments.clergy_id IS NOT NULL AND other.clergy_id = appointments.clergy_id)
            OR (appointments.venue_id IS NOT NULL AND other.venue_id = appointments.venue_id))
      )
      AND NOT EXISTS (
        SELECT 1 FROM clergy_assignments block
        WHERE block.status = 'confirmed'
          AND datetime(block.starts_at) < ${occupiedEnd('appointments')} AND datetime(block.ends_at) > ${occupiedStart('appointments')}
          AND ((appointments.clergy_id IS NOT NULL AND block.clergy_id = appointments.clergy_id)
            OR (appointments.venue_id IS NOT NULL AND block.venue_id = appointments.venue_id))
          AND NOT (block.starts_at = appointments.starts_at AND block.ends_at = appointments.ends_at
            AND COALESCE(block.venue_id, '') = COALESCE(appointments.venue_id, ''))
      )` : '';

  const db = getRawDb();
  const eventId = crypto.randomUUID();
  const notificationId = crypto.randomUUID();
  const statusLabel = mutation.status.replaceAll('_', ' ');
  const results = await db.batch([
    db.prepare(`UPDATE appointments SET
      status = ?, review_note = CASE WHEN ? = '' THEN review_note ELSE ? END,
      decision_reason = CASE WHEN ? IN ('approved','rejected') THEN ? ELSE decision_reason END,
      decided_by = CASE WHEN ? IN ('approved','rejected') THEN ? ELSE decided_by END,
      decided_at = CASE WHEN ? IN ('approved','rejected') THEN datetime('now') ELSE decided_at END,
      version = version + 1, updated_at = datetime('now')
    WHERE id = ? AND version = ? ${gateSql}`)
    .bind(
      mutation.status, reason, reason, mutation.status, reason || null,
      mutation.status, actor.id, mutation.status, mutation.appointmentId, mutation.expectedVersion,
    ),
    db.prepare(`INSERT INTO appointment_events
      (id, appointment_id, actor_id, event_type, from_status, to_status, detail)
      SELECT ?, ?, ?, 'status_changed', ?, ?, ? WHERE changes() = 1`)
      .bind(eventId, mutation.appointmentId, actor.id, current.status, mutation.status, reason || null),
    db.prepare(`INSERT INTO notifications
      (id, recipient_user_id, type, title, body, entity_type, entity_id)
      SELECT ?, ?, 'appointment', 'Appointment update', ?, 'appointment', ?
      WHERE EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
      .bind(notificationId, current.parishionerUserId,
        `${current.reference} is now ${statusLabel}.${reason ? ` ${reason}` : ''}`.slice(0, 1000),
        mutation.appointmentId, eventId),
    db.prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      SELECT ?, ?, 'appointment.transition', 'appointment', ?, ?, 'success', ?
      WHERE EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
      .bind(crypto.randomUUID(), actor.id, mutation.appointmentId, current.parishId,
        `${current.status} -> ${mutation.status}${reason ? `: ${reason}` : ''}`, eventId),
    // Closing an appointment also closes any open reschedule/cancellation request for it.
    db.prepare(`UPDATE appointment_change_requests SET status = 'withdrawn',
        decision_note = 'Closed because the appointment is now ' || ?, decided_by = ?, decided_at = datetime('now'), updated_at = datetime('now')
      WHERE appointment_id = ? AND status = 'pending' AND ? IN ${NON_BLOCKING_APPOINTMENT_STATUSES_SQL}
        AND EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
      .bind(statusLabel, actor.id, mutation.appointmentId, mutation.status, eventId),
    adminIdempotencyStatement(actor, idempotency, mutation.appointmentId, 'appointment_events', eventId),
  ]);

  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    const replay = await existingAdminIdempotency(actor, idempotency);
    if (replay?.requestHash === idempotency.requestHash) return;
    const fresh = await getAppointment(mutation.appointmentId);
    if (fresh.version !== mutation.expectedVersion) throw new AdminServiceError('This appointment changed in another session. Refresh and review it again.', 409);
    if (gateRequired) throw new AdminServiceError('Approval is blocked until every required document is human-verified and the clergy, venue, and time interval are conflict-free.', 409);
    throw new AdminServiceError('The appointment could not be updated.', 409);
  }

}

type ChangeRequestRow = {
  id: string;
  kind: 'reschedule' | 'cancel';
  requestStatus: string;
  requestedBy: string;
  previousStartsAt: string | null;
  proposedStartsAt: string | null;
  proposedEndsAt: string | null;
  reason: string;
  appointmentId: string;
  reference: string;
  parishionerUserId: string;
  parishId: string;
  clergyId: string | null;
  venueId: string | null;
  appointmentStatus: AppointmentStatus;
  startsAt: string;
  bufferBefore: number;
  bufferAfter: number;
};

function manilaWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }).format(new Date(iso));
}

/**
 * Decide a parishioner's reschedule or cancellation request.
 * - Only parish staff of the appointment's parish or the assigned priest may decide.
 * - Approving a reschedule re-runs the conflict check atomically (excluding the
 *   appointment itself) and moves the appointment; an approved appointment returns to
 *   "ready to approve" so the priest re-confirms the new time.
 * - Approving a cancellation cancels the appointment. Rejections require a note.
 */
async function decideChangeRequest(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'change_request.decide' }>,
  idempotency: AdminIdempotencyContext,
): Promise<void> {
  if (actor.role === 'system_admin') {
    throw new AdminServiceError('Technical administration does not include scheduling decisions. Parish staff or the assigned priest decide change requests.', 403);
  }
  const db = getRawDb();
  const row = await db.prepare(`SELECT cr.id, cr.kind, cr.status AS requestStatus, cr.requested_by AS requestedBy,
      cr.previous_starts_at AS previousStartsAt, cr.proposed_starts_at AS proposedStartsAt, cr.proposed_ends_at AS proposedEndsAt,
      cr.reason, a.id AS appointmentId, a.reference, a.parishioner_user_id AS parishionerUserId, a.parish_id AS parishId,
      a.clergy_id AS clergyId, a.venue_id AS venueId, a.status AS appointmentStatus, a.starts_at AS startsAt,
      COALESCE(a.buffer_before_minutes, s.buffer_before_minutes, 0) AS bufferBefore,
      COALESCE(a.buffer_after_minutes, s.buffer_after_minutes, 0) AS bufferAfter
    FROM appointment_change_requests cr
    JOIN appointments a ON a.id = cr.appointment_id
    JOIN service_types s ON s.id = a.service_type_id
    WHERE cr.id = ?`).bind(mutation.requestId).first<ChangeRequestRow>();
  if (!row) throw new AdminServiceError('Change request not found.', 404);
  if (!canDecideChangeRequest(actor, row)) throw new AdminServiceError('Only parish staff of this parish or the assigned priest can decide this request.', 403);
  if (row.requestStatus !== 'pending') throw new AdminServiceError('This request was already decided or withdrawn. Refresh to see its outcome.', 409);
  const note = mutation.note?.trim() ?? '';
  if (mutation.decision === 'reject' && note.length < 4) throw new AdminServiceError('Give the parishioner a short reason for declining the request.');

  const eventId = crypto.randomUUID();
  const label = row.kind === 'reschedule' ? 'reschedule' : 'cancellation';
  const closeRequest = (status: 'approved' | 'rejected') => db.prepare(`UPDATE appointment_change_requests SET status = ?, decided_by = ?,
      decided_at = datetime('now'), decision_note = ?, updated_at = datetime('now')
    WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
    .bind(status, actor.id, note || null, row.id, eventId);
  const notify = (title: string, body: string) => db.prepare(`INSERT INTO notifications
      (id, recipient_user_id, type, title, body, entity_type, entity_id)
    SELECT ?, ?, 'appointment', ?, ?, 'appointment', ? WHERE EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
    .bind(crypto.randomUUID(), row.parishionerUserId, title, body.slice(0, 1000), row.appointmentId, eventId);
  const audit = (detail: string) => db.prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
    SELECT ?, ?, ?, 'appointment_change_request', ?, ?, 'success', ? WHERE EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
    .bind(crypto.randomUUID(), actor.id, `change_request.${mutation.decision}`, row.id, row.parishId, detail.slice(0, 1000), eventId);

  if (mutation.decision === 'reject') {
    const results = await db.batch([
      db.prepare(`INSERT INTO appointment_events (id, appointment_id, actor_id, event_type, detail)
        SELECT ?, ?, ?, 'change_request_rejected', ? WHERE EXISTS (SELECT 1 FROM appointment_change_requests WHERE id = ? AND status = 'pending')`)
        .bind(eventId, row.appointmentId, actor.id, `${label} request declined: ${note}`, row.id),
      closeRequest('rejected'),
      notify(`${row.kind === 'reschedule' ? 'Reschedule' : 'Cancellation'} request declined`,
        `The parish declined your ${label} request for ${row.reference}. ${note} Your appointment remains as scheduled.`),
      audit(`${label} rejected: ${note}`),
      adminIdempotencyStatement(actor, idempotency, row.id, 'appointment_events', eventId),
    ]);
    if (Number(results[1]?.meta.changes ?? 0) < 1) throw new AdminServiceError('This request changed in another session. Refresh and try again.', 409);
    return;
  }

  if (TERMINAL_STATUSES.includes(row.appointmentStatus)) {
    throw new AdminServiceError(`The appointment is already ${row.appointmentStatus.replaceAll('_', ' ')}; this request can no longer be approved.`, 409);
  }

  if (row.kind === 'cancel') {
    const results = await db.batch([
      db.prepare(`UPDATE appointments SET status = 'cancelled', review_note = ?, version = version + 1, updated_at = datetime('now')
        WHERE id = ? AND status NOT IN ${NON_BLOCKING_APPOINTMENT_STATUSES_SQL}`)
        .bind(`Cancelled at the parishioner's request: ${row.reason}`, row.appointmentId),
      db.prepare(`INSERT INTO appointment_events (id, appointment_id, actor_id, event_type, from_status, to_status, detail)
        SELECT ?, ?, ?, 'status_changed', ?, 'cancelled', ? WHERE changes() = 1`)
        .bind(eventId, row.appointmentId, actor.id, row.appointmentStatus, `Cancellation request approved${note ? `: ${note}` : ''}`),
      closeRequest('approved'),
      notify('Cancellation confirmed', `The parish confirmed the cancellation of ${row.reference}.${note ? ` ${note}` : ''}`),
      audit(`cancellation approved${note ? `: ${note}` : ''}`),
      adminIdempotencyStatement(actor, idempotency, row.id, 'appointment_events', eventId),
    ]);
    if (Number(results[0]?.meta.changes ?? 0) !== 1) throw new AdminServiceError('The appointment changed in another session. Refresh and try again.', 409);
    return;
  }

  // Reschedule
  if (!row.proposedStartsAt || !row.proposedEndsAt || !row.clergyId || !row.venueId) throw new AdminServiceError('This reschedule request is incomplete.', 409);
  if (new Date(row.proposedStartsAt).getTime() < Date.now() + 60 * 60_000) {
    throw new AdminServiceError('The proposed time has already passed or is less than an hour away. Decline the request so the parishioner can choose another time.', 409);
  }
  const conflict = resourceConflict({
    blockedStart: new Date(new Date(row.proposedStartsAt).getTime() - Number(row.bufferBefore) * 60_000).toISOString(),
    blockedEnd: new Date(new Date(row.proposedEndsAt).getTime() + Number(row.bufferAfter) * 60_000).toISOString(),
    clergyId: row.clergyId, venueId: row.venueId, parishId: row.parishId, excludeAppointmentId: row.appointmentId,
  });
  const wasApproved = row.appointmentStatus === 'approved';
  const nextStatus: AppointmentStatus = wasApproved ? 'ready_to_approve' : row.appointmentStatus;
  const results = await db.batch([
    db.prepare(`UPDATE appointments SET starts_at = ?, ends_at = ?, status = ?, version = version + 1, updated_at = datetime('now')
      WHERE id = ? AND starts_at = ? AND status NOT IN ${NON_BLOCKING_APPOINTMENT_STATUSES_SQL} AND NOT ${conflict.sql}`)
      .bind(row.proposedStartsAt, row.proposedEndsAt, nextStatus, row.appointmentId, row.previousStartsAt ?? row.startsAt, ...conflict.values),
    db.prepare(`INSERT INTO appointment_events (id, appointment_id, actor_id, event_type, from_status, to_status, detail)
      SELECT ?, ?, ?, 'rescheduled', ?, ?, ? WHERE changes() = 1`)
      .bind(eventId, row.appointmentId, actor.id, row.appointmentStatus, nextStatus,
        `Moved from ${row.startsAt} to ${row.proposedStartsAt}${note ? `: ${note}` : ''}`),
    closeRequest('approved'),
    notify('Reschedule approved', `${row.reference} is now scheduled for ${manilaWhen(row.proposedStartsAt)}.${wasApproved ? ' The priest will re-confirm the new time.' : ''}${note ? ` ${note}` : ''}`),
    audit(`reschedule approved: ${row.startsAt} -> ${row.proposedStartsAt}${note ? `: ${note}` : ''}`),
    adminIdempotencyStatement(actor, idempotency, row.id, 'appointment_events', eventId),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    const replay = await existingAdminIdempotency(actor, idempotency);
    if (replay?.requestHash === idempotency.requestHash) return;
    throw new AdminServiceError('The proposed time is no longer free for this priest or venue, or the appointment changed. Decline the request so the parishioner can choose another time.', 409);
  }
}

async function reviewDocument(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'document.review' }>,
  idempotency: AdminIdempotencyContext,
): Promise<void> {
  if (actor.role !== 'parish_staff') throw new AdminServiceError('Document verification requires assigned parish staff access.', 403);
  if (mutation.documentId.startsWith('missing:')) throw new AdminServiceError('No file has been submitted for this requirement.', 409);
  const row = await getRawDb().prepare(`SELECT ds.id, ds.storage_key AS storageKey,
      ds.original_file_name AS fileName, ds.status, ds.appointment_id AS appointmentId,
      ds.requirement_name AS requirementName, a.reference,
      a.parishioner_user_id AS parishionerUserId,
      a.parish_id AS parishId, a.clergy_id AS clergyId
    FROM document_submissions ds JOIN appointments a ON a.id = ds.appointment_id
    WHERE ds.id = ?`).bind(mutation.documentId).first<{
      id: string; storageKey: string | null; fileName: string | null; status: string;
      appointmentId: string; requirementName: string; reference: string; parishionerUserId: string;
      parishId: string; clergyId: string | null;
    }>();
  if (!row) throw new AdminServiceError('Document submission not found.', 404);
  if (!canAccessAppointment(actor, row)) throw new AdminServiceError('You cannot review this document.', 403);
  if (!row.storageKey && !row.fileName) throw new AdminServiceError('A file must be submitted before review.', 409);
  const note = mutation.note?.trim() ?? '';
  if (mutation.status === 'needs_replacement' && note.length < 4) throw new AdminServiceError('Explain what must be replaced.');

  const db = getRawDb();
  const eventId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`UPDATE document_submissions SET status = ?, reviewer_id = ?,
      review_note = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND status = ? AND sha256 = ? AND storage_key IS NOT NULL
        AND EXISTS (SELECT 1 FROM appointments a WHERE a.id = document_submissions.appointment_id
          AND a.status IN ('submitted','documents_pending','under_review','needs_changes'))`)
      .bind(mutation.status, actor.id, note || null, mutation.documentId, row.status, mutation.expectedSha256),
    db.prepare(`INSERT INTO appointment_events
      (id, appointment_id, actor_id, event_type, detail)
      SELECT ?, ?, ?, 'document_reviewed', ? WHERE changes() = 1`)
      .bind(eventId, row.appointmentId, actor.id, `${row.requirementName}: ${mutation.status}${note ? `: ${note}` : ''}`),
    db.prepare(`INSERT INTO notifications
      (id, recipient_user_id, type, title, body, entity_type, entity_id)
      SELECT ?, ?, 'document', 'Document review update', ?, 'appointment', ?
      WHERE EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
      .bind(crypto.randomUUID(), row.parishionerUserId,
        `${row.requirementName} for ${row.reference} was ${mutation.status === 'verified' ? 'verified' : 'returned for replacement'}.${note ? ` ${note}` : ''}`.slice(0, 1000),
        row.appointmentId, eventId),
    db.prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      SELECT ?, ?, 'document.review', 'document_submission', ?, ?, 'success', ?
      WHERE EXISTS (SELECT 1 FROM appointment_events WHERE id = ?)`)
      .bind(crypto.randomUUID(), actor.id, mutation.documentId, row.parishId,
        `${mutation.status}${note ? `: ${note}` : ''}`, eventId),
    adminIdempotencyStatement(actor, idempotency, mutation.documentId, 'appointment_events', eventId),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    const replay = await existingAdminIdempotency(actor, idempotency);
    if (replay?.requestHash === idempotency.requestHash) return;
    throw new AdminServiceError('The document changed in another session. Refresh before reviewing it again.', 409);
  }
}

function canAccessParish(actor: Actor, parishId: string): boolean {
  return actor.role === 'system_admin' || actor.parishId === parishId;
}

const ADMIN_QUEUE_SERVICES = new Set([
  'Baptism inquiry',
  'Wedding inquiry',
  'Document submission',
  'Certificate request',
  'General inquiry',
]);

function randomQueueNumber(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `Q-${date}-${suffix}`;
}

async function issueQueueTicket(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'queue.issue' }>,
  idempotency: AdminIdempotencyContext,
): Promise<void> {
  if (actor.role === 'clergy') throw new AdminServiceError('Queue operations are limited to parish staff and system administrators.', 403);
  if (!canAccessParish(actor, mutation.parishId)) throw new AdminServiceError('You cannot issue tickets for this parish.', 403);
  const parishionerName = mutation.parishionerName.trim().replace(/\s+/g, ' ');
  const service = mutation.service.trim();
  if (parishionerName.length < 2 || parishionerName.length > 120) throw new AdminServiceError('Enter the visitor’s name.');
  if (!ADMIN_QUEUE_SERVICES.has(service)) throw new AdminServiceError('Choose a valid queue purpose.');
  const parish = await getRawDb().prepare('SELECT id FROM parishes WHERE id = ? AND is_active = 1')
    .bind(mutation.parishId).first<{ id: string }>();
  if (!parish) throw new AdminServiceError('Choose an active parish.');
  const db = getRawDb();
  const id = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`INSERT INTO queue_tickets
      (id, ticket_number, parish_id, parishioner_name, service)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(id, randomQueueNumber(), mutation.parishId, parishionerName, service),
    db.prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      SELECT ?, ?, 'queue.issue', 'queue_ticket', ?, ?, 'success', ? WHERE changes() = 1`)
      .bind(auditId, actor.id, id, mutation.parishId, `${service}; accountless front-desk ticket`),
    adminIdempotencyStatement(actor, idempotency, id, 'audit_logs', auditId),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    const replay = await existingAdminIdempotency(actor, idempotency);
    if (replay?.requestHash === idempotency.requestHash) return;
    throw new AdminServiceError('The ticket could not be issued. Try again.', 409);
  }
}

async function callNext(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'queue.call_next' }>,
  idempotency: AdminIdempotencyContext,
): Promise<void> {
  if (actor.role === 'clergy') throw new AdminServiceError('Queue operations are limited to parish staff and system administrators.', 403);
  if (!canAccessParish(actor, mutation.parishId)) throw new AdminServiceError('You cannot operate this parish queue.', 403);
  const counter = mutation.counter.trim();
  if (counter.length < 2 || counter.length > 40) throw new AdminServiceError('Enter a valid counter or window name.');
  const db = getRawDb();
  const active = await db.prepare(`SELECT id FROM queue_tickets
    WHERE parish_id = ? AND status = 'serving' AND counter = ? LIMIT 1`)
    .bind(mutation.parishId, counter).first<{ id: string }>();
  if (active) throw new AdminServiceError(`${counter} already has an active ticket. Complete it before calling another.`, 409);
  const next = await db.prepare(`SELECT id, ticket_number AS number, parishioner_user_id AS parishionerUserId
    FROM queue_tickets WHERE parish_id = ? AND status = 'waiting'
    ORDER BY priority DESC, issued_at ASC LIMIT 1`).bind(mutation.parishId).first<{
      id: string; number: string; parishionerUserId: string | null;
    }>();
  if (!next) throw new AdminServiceError('No waiting ticket is available for this parish.', 409);
  const auditId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`UPDATE queue_tickets SET status = 'serving', counter = ?,
      called_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'waiting'`)
      .bind(counter, next.id),
    db.prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      SELECT ?, ?, 'queue.call_next', 'queue_ticket', ?, ?, 'success', ? WHERE changes() = 1`)
      .bind(auditId, actor.id, next.id, mutation.parishId, `Called at ${counter}`),
    db.prepare(`INSERT INTO notifications
      (id, recipient_user_id, type, title, body, entity_type, entity_id)
      SELECT ?, ?, 'queue', 'Your queue ticket was called', ?, 'queue_ticket', ?
      WHERE ? IS NOT NULL AND EXISTS (SELECT 1 FROM audit_logs WHERE id = ?)`)
      .bind(crypto.randomUUID(), next.parishionerUserId, `${next.number} is now being served at ${counter}.`, next.id,
        next.parishionerUserId, auditId),
    adminIdempotencyStatement(actor, idempotency, next.id, 'audit_logs', auditId),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    const replay = await existingAdminIdempotency(actor, idempotency);
    if (replay?.requestHash === idempotency.requestHash) return;
    throw new AdminServiceError('Another counter called this ticket first. Try again.', 409);
  }
}

async function completeQueueTicket(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'queue.complete' }>,
  idempotency: AdminIdempotencyContext,
): Promise<void> {
  if (actor.role === 'clergy') throw new AdminServiceError('Queue operations are limited to parish staff and system administrators.', 403);
  const row = await getRawDb().prepare(`SELECT id, ticket_number AS number,
      parishioner_user_id AS parishionerUserId, parish_id AS parishId, status
    FROM queue_tickets WHERE id = ?`)
    .bind(mutation.ticketId).first<{
      id: string; number: string; parishionerUserId: string | null; parishId: string; status: string;
    }>();
  if (!row) throw new AdminServiceError('Queue ticket not found.', 404);
  if (!canAccessParish(actor, row.parishId)) throw new AdminServiceError('You cannot operate this parish queue.', 403);
  if (row.status !== 'serving') throw new AdminServiceError('Only a ticket currently being served can be completed.', 409);
  const db = getRawDb();
  const auditId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`UPDATE queue_tickets SET status = 'served', served_at = datetime('now'),
      updated_at = datetime('now') WHERE id = ? AND status = 'serving'`).bind(row.id),
    db.prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      SELECT ?, ?, 'queue.complete', 'queue_ticket', ?, ?, 'success', 'Service completed' WHERE changes() = 1`)
      .bind(auditId, actor.id, row.id, row.parishId),
    db.prepare(`INSERT INTO notifications
      (id, recipient_user_id, type, title, body, entity_type, entity_id)
      SELECT ?, ?, 'queue', 'Queue visit completed', ?, 'queue_ticket', ?
      WHERE ? IS NOT NULL AND EXISTS (SELECT 1 FROM audit_logs WHERE id = ?)`)
      .bind(crypto.randomUUID(), row.parishionerUserId, `${row.number} was marked completed.`, row.id,
        row.parishionerUserId, auditId),
    adminIdempotencyStatement(actor, idempotency, row.id, 'audit_logs', auditId),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    const replay = await existingAdminIdempotency(actor, idempotency);
    if (replay?.requestHash === idempotency.requestHash) return;
    throw new AdminServiceError('The ticket changed in another session. Refresh and try again.', 409);
  }
}

async function publishAnnouncement(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'announcement.publish' }>,
  idempotency: AdminIdempotencyContext,
): Promise<void> {
  if (actor.role === 'clergy') throw new AdminServiceError('Announcement publishing is limited to parish staff and system administrators.', 403);
  const title = mutation.title.trim();
  const body = mutation.body.trim();
  if (title.length < 4 || title.length > 120) throw new AdminServiceError('Announcement titles must be 4–120 characters.');
  if (body.length < 10 || body.length > 2000) throw new AdminServiceError('Announcement text must be 10–2,000 characters.');
  if (mutation.audience === 'all' && actor.role !== 'system_admin') throw new AdminServiceError('Only system administrators can publish vicariate-wide announcements.', 403);
  const parishId = mutation.audience === 'all' ? null : actor.role === 'system_admin' ? mutation.parishId ?? null : actor.parishId;
  if (mutation.audience === 'parish' && (!parishId || !canAccessParish(actor, parishId))) throw new AdminServiceError('Choose a parish you are authorized to manage.');
  const id = crypto.randomUUID();
  const db = getRawDb();
  await db.batch([
    db.prepare(`INSERT INTO announcements
      (id, author_id, parish_id, audience, title, body, status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, 'published', datetime('now'))`)
      .bind(id, actor.id, parishId, mutation.audience, title, body),
    db.prepare(`INSERT INTO notifications
      (id, recipient_user_id, type, title, body, entity_type, entity_id)
      SELECT lower(hex(randomblob(16))), u.id, 'announcement', ?, ?, 'announcement', ?
      FROM users u WHERE u.role = 'parishioner' AND u.is_active = 1
        AND (? = 'all' OR u.home_parish_id = ?)`)
      .bind(title, body, id, mutation.audience, parishId),
    db.prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      SELECT ?, ?, 'announcement.publish', 'announcement', ?, ?, 'success', ?
      WHERE EXISTS (SELECT 1 FROM announcements WHERE id = ?)`)
      .bind(crypto.randomUUID(), actor.id, id, parishId, title, id),
    adminIdempotencyStatement(actor, idempotency, id, 'announcements', id),
  ]);
}

function requireStaffRole(actor: Actor, feature: string): void {
  if (actor.role === 'clergy') throw new AdminServiceError(`${feature} is limited to parish staff and system administrators.`, 403);
}

async function createRecord(actor: Actor, mutation: Extract<AdminMutation, { action: 'record.create' }>): Promise<void> {
  if (actor.role !== 'parish_staff') throw new AdminServiceError('Records require assigned parish staff access.', 403);
  requireStaffRole(actor, 'Record management');
  if (!canAccessParish(actor, mutation.parishId)) throw new AdminServiceError('You cannot manage records for this parish.', 403);
  const recordType = mutation.recordType.trim();
  const subjectName = mutation.subjectName.trim().replace(/\s+/g, ' ');
  const reference = mutation.reference.trim().toUpperCase();
  if (recordType.length < 3 || recordType.length > 60) throw new AdminServiceError('Record type must be 3–60 characters.');
  if (subjectName.length < 3 || subjectName.length > 160) throw new AdminServiceError('Subject name must be 3–160 characters.');
  if (!validCalendarDate(mutation.eventDate)) {
    throw new AdminServiceError('Choose a valid event date.');
  }
  if (!/^[A-Z0-9][A-Z0-9/-]{5,49}$/.test(reference)) throw new AdminServiceError('Use a 6–50 character archive reference with letters, numbers, slashes, or hyphens.');
  const id = crypto.randomUUID();
  try {
    await getRawDb().prepare(`INSERT INTO sacramental_records
      (id, parish_id, record_type, subject_name, event_date, reference, status)
      VALUES (?, ?, ?, ?, ?, ?, 'working_copy')`)
      .bind(id, mutation.parishId, recordType, subjectName, mutation.eventDate, reference).run();
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) throw new AdminServiceError('That archive reference already exists.', 409);
    throw error;
  }
  await writeAudit(actor, 'record.create', 'sacramental_record', id, mutation.parishId, 'success', `${recordType}; ${reference}`);
}

async function verifyRecord(actor: Actor, mutation: Extract<AdminMutation, { action: 'record.verify' }>): Promise<void> {
  if (actor.role !== 'parish_staff') throw new AdminServiceError('Records require assigned parish staff access.', 403);
  requireStaffRole(actor, 'Record management');
  const row = await getRawDb().prepare(`SELECT id, parish_id AS parishId, status
    FROM sacramental_records WHERE id = ?`).bind(mutation.recordId).first<{ id: string; parishId: string; status: string }>();
  if (!row) throw new AdminServiceError('Record not found.', 404);
  if (!canAccessParish(actor, row.parishId)) throw new AdminServiceError('You cannot manage this record.', 403);
  if (row.status === 'verified_against_archive') throw new AdminServiceError('This record is already verified against the archive.', 409);
  await getRawDb().prepare(`UPDATE sacramental_records SET status = 'verified_against_archive',
    verified_against_archive_at = datetime('now'), verified_by = ?, updated_at = datetime('now')
    WHERE id = ? AND status = 'working_copy'`).bind(actor.id, row.id).run();
  await writeAudit(actor, 'record.verify', 'sacramental_record', row.id, row.parishId, 'success', 'Verified against the authorized parish archive');
}

async function createClergyAssignment(actor: Actor, mutation: Extract<AdminMutation, { action: 'clergy.assignment.create' }>): Promise<void> {
  requireStaffRole(actor, 'Clergy schedule management');
  if (!canAccessParish(actor, mutation.parishId)) throw new AdminServiceError('You cannot manage this parish schedule.', 403);
  const startsAt = new Date(mutation.startsAt);
  const endsAt = new Date(mutation.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new AdminServiceError('Choose a valid start and end time.');
  if (startsAt.getTime() < Date.now() - 5 * 60_000) throw new AdminServiceError('New clergy assignments must start in the future.');
  if (endsAt.getTime() <= startsAt.getTime() || endsAt.getTime() - startsAt.getTime() > 12 * 60 * 60 * 1000) {
    throw new AdminServiceError('The assignment end must be after the start and no more than 12 hours later.');
  }
  const service = mutation.service.trim();
  if (service.length < 3 || service.length > 100) throw new AdminServiceError('Service must be 3–100 characters.');
  const db = getRawDb();
  const resource = await db.prepare(`SELECT cp.display_title AS clergyName, v.name AS venueName
    FROM clergy_profiles cp JOIN venues v ON v.id = ? AND v.parish_id = ? AND v.is_active = 1
    WHERE cp.id = ? AND cp.is_active = 1 AND EXISTS (SELECT 1 FROM users u WHERE u.id = cp.user_id AND u.is_active = 1) AND (cp.home_parish_id = ? OR cp.home_parish_id IS NULL) LIMIT 1`)
    .bind(mutation.venueId, mutation.parishId, mutation.clergyId, mutation.parishId)
    .first<{ clergyName: string; venueName: string }>();
  if (!resource) throw new AdminServiceError('Choose an active priest and venue for that parish.');
  const id = crypto.randomUUID();
  const conflict = resourceConflict({
    blockedStart: startsAt.toISOString(), blockedEnd: endsAt.toISOString(),
    clergyId: mutation.clergyId, venueId: mutation.venueId, parishId: mutation.parishId,
  });
  const result = await db.prepare(`INSERT INTO clergy_assignments
    (id, clergy_id, clergy_name, parish_id, venue_id, venue_name, service, starts_at, ends_at, created_by)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT ${conflict.sql}`).bind(
      id, mutation.clergyId, resource.clergyName, mutation.parishId, mutation.venueId,
      resource.venueName, service, startsAt.toISOString(), endsAt.toISOString(), actor.id,
      ...conflict.values,
    ).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new AdminServiceError('That priest or venue already has an overlapping appointment or assignment.', 409);
  await writeAudit(actor, 'clergy.assignment.create', 'clergy_assignment', id, mutation.parishId, 'success', `${service}; ${startsAt.toISOString()}`);
}

async function cancelClergyAssignment(actor: Actor, mutation: Extract<AdminMutation, { action: 'clergy.assignment.cancel' }>): Promise<void> {
  requireStaffRole(actor, 'Clergy schedule management');
  const row = await getRawDb().prepare(`SELECT id, parish_id AS parishId, status FROM clergy_assignments WHERE id = ?`)
    .bind(mutation.assignmentId).first<{ id: string; parishId: string; status: string }>();
  if (!row) throw new AdminServiceError('Clergy assignment not found.', 404);
  if (!canAccessParish(actor, row.parishId)) throw new AdminServiceError('You cannot manage this assignment.', 403);
  if (row.status !== 'confirmed') throw new AdminServiceError('Only a confirmed assignment can be cancelled.', 409);
  await getRawDb().prepare(`UPDATE clergy_assignments SET status = 'cancelled',
    updated_at = datetime('now') WHERE id = ? AND status = 'confirmed'`).bind(row.id).run();
  await writeAudit(actor, 'clergy.assignment.cancel', 'clergy_assignment', row.id, row.parishId, 'success', 'Assignment cancelled');
}

async function provisionUser(actor: Actor, mutation: Extract<AdminMutation, { action: 'user.provision' }>): Promise<void> {
  if (actor.role !== 'system_admin') throw new AdminServiceError('Only system administrators can provision internal access.', 403);
  const fullName = mutation.fullName.trim().replace(/\s+/g, ' ');
  const email = mutation.email.trim().toLowerCase();
  if (fullName.length < 3 || fullName.length > 120) throw new AdminServiceError('Enter the person’s complete name.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AdminServiceError('Enter a valid email address.');
  if (mutation.role !== 'parish_staff' && mutation.role !== 'clergy') throw new AdminServiceError('Choose parish staff or clergy access.');
  const parish = await getRawDb().prepare('SELECT id FROM parishes WHERE id = ? AND is_active = 1')
    .bind(mutation.parishId).first<{ id: string }>();
  if (!parish) throw new AdminServiceError('Choose an active parish.');
  const id = crypto.randomUUID();
  const statements = [
    getRawDb().prepare(`INSERT INTO users
      (id, email, full_name, role, home_parish_id) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, email, fullName, mutation.role, mutation.parishId),
  ];
  if (mutation.role === 'clergy') {
    statements.push(getRawDb().prepare(`INSERT INTO clergy_profiles
      (id, user_id, display_title, home_parish_id) VALUES (?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), id, fullName, mutation.parishId));
  }
  try {
    await getRawDb().batch(statements);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) throw new AdminServiceError('An account already uses that email address.', 409);
    throw error;
  }
  await writeAudit(actor, 'user.provision', 'user', id, mutation.parishId, 'success', `${mutation.role}; ${email}`);
}

async function setUserActive(actor: Actor, mutation: Extract<AdminMutation, { action: 'user.set_active' }>): Promise<void> {
  if (actor.role !== 'system_admin') throw new AdminServiceError('Only system administrators can change internal access.', 403);
  if (mutation.userId === actor.id && !mutation.isActive) throw new AdminServiceError('You cannot deactivate your own signed-in account.', 409);
  const target = await getRawDb().prepare(`SELECT id, home_parish_id AS parishId, role, is_active AS isActive
    FROM users WHERE id = ? AND role IN ('parish_staff','clergy','system_admin')`).bind(mutation.userId)
    .first<{ id: string; parishId: string | null; role: string; isActive: number }>();
  if (!target) throw new AdminServiceError('Internal user not found.', 404);
  if (Boolean(target.isActive) === mutation.isActive) throw new AdminServiceError('That access state is already set.', 409);
  await getRawDb().batch([
    getRawDb().prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(mutation.isActive ? 1 : 0, target.id),
    // Deactivation ends every open internal portal session for that person immediately.
    getRawDb().prepare(`UPDATE staff_sessions SET revoked_at = datetime('now')
      WHERE user_id = ? AND revoked_at IS NULL AND ? = 0`).bind(target.id, mutation.isActive ? 1 : 0),
  ]);
  await writeAudit(actor, 'user.set_active', 'user', target.id, target.parishId, 'success', mutation.isActive ? 'Access activated' : 'Access deactivated');
}

async function createVenue(actor: Actor, mutation: Extract<AdminMutation, { action: 'venue.create' }>): Promise<void> {
  requireStaffRole(actor, 'Venue management');
  if (!canAccessParish(actor, mutation.parishId)) throw new AdminServiceError('You cannot manage venues for this parish.', 403);
  const name = mutation.name.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 100) throw new AdminServiceError('Venue name must be 3–100 characters.');
  if (mutation.capacity !== undefined && (!Number.isInteger(mutation.capacity) || mutation.capacity < 1 || mutation.capacity > 10_000)) {
    throw new AdminServiceError('Venue capacity must be a whole number from 1 to 10,000.');
  }
  const id = crypto.randomUUID();
  try {
    await getRawDb().prepare(`INSERT INTO venues (id, parish_id, name, capacity) VALUES (?, ?, ?, ?)`)
      .bind(id, mutation.parishId, name, mutation.capacity ?? null).run();
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) throw new AdminServiceError('That parish already has a venue with this name.', 409);
    throw error;
  }
  await writeAudit(actor, 'venue.create', 'venue', id, mutation.parishId, 'success', `${name}; capacity=${mutation.capacity ?? 'unspecified'}`);
}

export async function performAdminMutation(
  actor: Actor,
  mutation: AdminMutation,
  idempotencyKey: string,
): Promise<void> {
  const idempotency = await prepareAdminIdempotency(actor, mutation, idempotencyKey);
  if (!idempotency) return;
  switch (mutation.action) {
    case 'appointment.transition':
      return transitionAppointment(actor, mutation, idempotency);
    case 'document.review':
      return reviewDocument(actor, mutation, idempotency);
    case 'queue.call_next':
      return callNext(actor, mutation, idempotency);
    case 'queue.complete':
      return completeQueueTicket(actor, mutation, idempotency);
    case 'queue.issue':
      return issueQueueTicket(actor, mutation, idempotency);
    case 'announcement.publish':
      return publishAnnouncement(actor, mutation, idempotency);
    case 'record.create':
      await createRecord(actor, mutation);
      return finishAdminIdempotency(actor, idempotency);
    case 'record.verify':
      await verifyRecord(actor, mutation);
      return finishAdminIdempotency(actor, idempotency, mutation.recordId);
    case 'clergy.assignment.create':
      await createClergyAssignment(actor, mutation);
      return finishAdminIdempotency(actor, idempotency);
    case 'clergy.assignment.cancel':
      await cancelClergyAssignment(actor, mutation);
      return finishAdminIdempotency(actor, idempotency, mutation.assignmentId);
    case 'user.provision':
      await provisionUser(actor, mutation);
      return finishAdminIdempotency(actor, idempotency);
    case 'user.set_active':
      await setUserActive(actor, mutation);
      return finishAdminIdempotency(actor, idempotency, mutation.userId);
    case 'venue.create':
      await createVenue(actor, mutation);
      return finishAdminIdempotency(actor, idempotency);
    case 'change_request.decide':
      return decideChangeRequest(actor, mutation, idempotency);
    case 'parish.profile.update': {
      const parishId = await updateParishProfile(actor, mutation);
      return finishAdminIdempotency(actor, idempotency, parishId);
    }
    case 'service.update': {
      const serviceId = await updateServiceSetting(actor, mutation);
      return finishAdminIdempotency(actor, idempotency, serviceId);
    }
    case 'requirement.create': {
      const requirementId = await createRequirementSetting(actor, mutation);
      return finishAdminIdempotency(actor, idempotency, requirementId);
    }
    case 'requirement.update': {
      const requirementId = await updateRequirementSetting(actor, mutation);
      return finishAdminIdempotency(actor, idempotency, requirementId);
    }
  }
}
