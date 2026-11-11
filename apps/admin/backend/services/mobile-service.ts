import { validCalendarDate, validPhoneNumber, utcTimestamp } from '@/shared/validation';
import { resourceConflict } from '@/shared/scheduling';
import { parishionerChangeOptions } from '@/shared/change-policy';
import type { AppointmentStatus } from '@/shared/domain';
import { generateDueReminders } from '@/backend/services/reminders';
import { ensurePublicRuntimeDatabase, getRawDb } from '@/db/runtime';
import { MobileServiceError, type MobileActor, type MobileProfile } from '@/backend/auth/mobile-auth';
import { sha256Hex } from '@/backend/security/idempotency';
import { env } from 'cloudflare:workers';
import { generatePublicAssistantReply, publicGeminiEligibility, type AssistantFallbackReason, type PublicKnowledgeSource } from '@/backend/ai/gemini-assistant';
import { recordServerFailure } from '@/backend/observability/server-log';

const SERVICE_TO_MOBILE: Record<string, string> = {
  baptism: 'baptism',
  wedding: 'wedding',
  confirmation: 'confirmation',
  'first-communion': 'first_communion',
  'funeral-mass': 'funeral',
};

const MOBILE_TO_SERVICE: Record<string, string> = Object.fromEntries(
  Object.entries(SERVICE_TO_MOBILE).map(([server, mobile]) => [mobile, server]),
);

const QUEUE_SERVICES = new Set([
  'Baptism inquiry',
  'Wedding inquiry',
  'Document submission',
  'Certificate request',
  'General inquiry',
]);

export async function loadMobileCatalog() {
  await ensurePublicRuntimeDatabase();
  const db = getRawDb();
  const [parishes, clergy, venues, services, requirements] = await Promise.all([
    db.prepare(`SELECT id, name, address, office_hours AS officeHours, contact_phone AS contactPhone,
      contact_email AS contactEmail, description FROM parishes WHERE is_active = 1 ORDER BY CASE id
      WHEN 'metropolitan-cathedral' THEN 1 WHEN 'san-guillermo' THEN 2
      WHEN 'sanctuario-san-jose' THEN 3 WHEN 'sta-lucia' THEN 4
      WHEN 'sto-nino' THEN 5 WHEN 'san-isidro-labrador' THEN 6
      WHEN 'st-joseph' THEN 7 WHEN 'our-lady-of-lourdes' THEN 8 ELSE 99 END`).all<{
        id: string; name: string; address: string | null; officeHours: string | null;
        contactPhone: string | null; contactEmail: string | null; description: string | null;
      }>(),
    db.prepare(`SELECT id, display_title AS name, home_parish_id AS parishId
      FROM clergy_profiles WHERE is_active = 1 AND EXISTS (SELECT 1 FROM users u WHERE u.id = clergy_profiles.user_id AND u.is_active = 1) ORDER BY display_title`).all<{ id: string; name: string; parishId: string | null }>(),
    db.prepare(`SELECT id, parish_id AS parishId FROM venues WHERE is_active = 1 ORDER BY name`).all<{ id: string; parishId: string }>(),
    db.prepare(`SELECT id, name, description, duration_minutes AS durationMinutes
      FROM service_types WHERE is_active = 1 ORDER BY CASE id
        WHEN 'baptism' THEN 1 WHEN 'wedding' THEN 2 WHEN 'confirmation' THEN 3
        WHEN 'first-communion' THEN 4 WHEN 'funeral-mass' THEN 5 ELSE 99 END`).all<{
          id: string; name: string; description: string | null; durationMinutes: number;
        }>(),
    db.prepare(`SELECT id, service_type_id AS serviceTypeId, name, instructions, is_required AS isRequired FROM document_requirements
      WHERE is_active = 1 ORDER BY service_type_id, sort_order`).all<{ id: string; serviceTypeId: string; name: string; instructions: string | null; isRequired: number }>(),
  ]);
  const icon: Record<string, string> = {
    baptism: 'droplet', wedding: 'heart', confirmation: 'cross',
    'first-communion': 'sun', 'funeral-mass': 'flame',
  };
  return {
    parishes: parishes.results.map(({ address, officeHours, contactPhone, contactEmail, description, ...parish }) => ({
      ...parish,
      clergy: clergy.results.filter((item) => item.parishId === parish.id).map(({ id, name }) => ({ id, name })),
      venueId: venues.results.find((item) => item.parishId === parish.id)?.id ?? '',
      // Public contact details entered by the parish (null until published).
      contact: { address, officeHours, phone: contactPhone, email: contactEmail, description },
    })),
    services: services.results.map((service) => ({
      id: SERVICE_TO_MOBILE[service.id] ?? service.id,
      name: service.name,
      shortDescription: service.description ?? `Prepare and request ${service.name.toLowerCase()} services with your parish.`,
      durationMinutes: Number(service.durationMinutes),
      requirements: requirements.results.filter((item) => item.serviceTypeId === service.id).map((item) => item.name),
      requirementDetails: requirements.results.filter(item => item.serviceTypeId === service.id).map(item => ({
        id: item.id, name: item.name, required: Boolean(item.isRequired), instructions: item.instructions,
      })),
      icon: icon[service.id] ?? 'cross',
    })),
    queueServices: Array.from(QUEUE_SERVICES),
  };
}

type AppointmentRow = {
  id: string;
  reference: string;
  parishionerId: string;
  serviceTypeId: string;
  parishId: string;
  clergyId: string;
  venueId: string;
  startsAt: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  status: string;
  submittedAt: string;
  updatedAt: string;
  pendingKind: 'reschedule' | 'cancel' | null;
  pendingProposedStartsAt: string | null;
  pendingReason: string | null;
  pendingCreatedAt: string | null;
  lastDecisionKind: 'reschedule' | 'cancel' | null;
  lastDecisionStatus: 'approved' | 'rejected' | null;
  lastDecisionNote: string | null;
};

type DocumentRow = {
  id: string;
  appointmentId: string;
  label: string;
  status: string;
  required: number;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  note: string | null;
  updatedAt: string;
};

type ParticipantRow = {
  appointmentId: string;
  type: string;
  fullName: string;
  dateOfBirth: string | null;
  notes: string | null;
};

function mobileAppointmentStatus(status: string): string {
  switch (status) {
    case 'documents_pending':
    case 'under_review':
    case 'ready_to_approve':
      return 'pending_verification';
    case 'needs_changes':
      return 'needs_action';
    case 'approved':
      return 'approved';
    case 'completed':
      return 'completed';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
    case 'no_show':
      return 'cancelled';
    default:
      return 'submitted';
  }
}

function mobileDocumentStatus(status: string): string {
  switch (status) {
    case 'not_submitted': return 'missing';
    case 'needs_replacement': return 'needs_action';
    default: return status;
  }
}

function displayTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

function displayDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Manila',
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function appointmentDto(row: AppointmentRow, documents: DocumentRow[], participants: ParticipantRow[]) {
  return {
    id: row.id,
    reference: row.reference,
    parishionerId: row.parishionerId,
    serviceId: SERVICE_TO_MOBILE[row.serviceTypeId] ?? row.serviceTypeId,
    parishId: row.parishId,
    clergyId: row.clergyId,
    venueId: row.venueId,
    date: displayDate(row.startsAt),
    time: displayTime(row.startsAt),
    durationMinutes: Number(row.durationMinutes),
    bufferBeforeMinutes: Number(row.bufferBeforeMinutes),
    bufferAfterMinutes: Number(row.bufferAfterMinutes),
    status: mobileAppointmentStatus(row.status),
    participants: participants.filter((participant) => participant.appointmentId === row.id).map((participant) => ({
      type: participant.type,
      fullName: participant.fullName,
      ...(participant.dateOfBirth ? { dateOfBirth: participant.dateOfBirth } : {}),
      ...(participant.notes ? { notes: participant.notes } : {}),
    })),
    documents: documents.filter((document) => document.appointmentId === row.id).map((document) => ({
      id: document.id,
      label: document.label,
      status: mobileDocumentStatus(document.status),
      required: Boolean(document.required),
      ...(document.fileName ? { fileName: document.fileName } : {}),
      ...(document.mimeType ? { mimeType: document.mimeType } : {}),
      ...(document.sizeBytes ? { sizeBytes: Number(document.sizeBytes) } : {}),
      ...(document.note ? { note: document.note } : {}),
      updatedAt: document.updatedAt,
    })),
    submittedAt: utcTimestamp(row.submittedAt),
    updatedAt: utcTimestamp(row.updatedAt),
    /** Raw workflow status for precise labels (the simplified `status` above is kept for older clients). */
    workflowStatus: row.status,
    pendingChange: row.pendingKind ? {
      kind: row.pendingKind,
      ...(row.pendingProposedStartsAt ? { proposedDate: displayDate(row.pendingProposedStartsAt), proposedTime: displayTime(row.pendingProposedStartsAt) } : {}),
      reason: row.pendingReason ?? '',
      requestedAt: utcTimestamp(row.pendingCreatedAt ?? row.updatedAt),
    } : null,
    lastChangeDecision: row.lastDecisionKind && row.lastDecisionStatus ? {
      kind: row.lastDecisionKind, status: row.lastDecisionStatus, ...(row.lastDecisionNote ? { note: row.lastDecisionNote } : {}),
    } : null,
    allowedChanges: parishionerChangeOptions(row.status as AppointmentStatus, row.startsAt, Boolean(row.pendingKind)),
  };
}

async function loadAppointments(userId: string) {
  const db = getRawDb();
  const [appointments, documents, participants] = await Promise.all([
    db.prepare(`SELECT a.id, a.reference, a.parishioner_user_id AS parishionerId,
      a.service_type_id AS serviceTypeId, a.parish_id AS parishId,
      COALESCE(a.clergy_id, '') AS clergyId, COALESCE(a.venue_id, '') AS venueId,
      a.starts_at AS startsAt,
      CAST(ROUND((julianday(a.ends_at) - julianday(a.starts_at)) * 1440) AS INTEGER) AS durationMinutes,
      COALESCE(a.buffer_before_minutes, s.buffer_before_minutes) AS bufferBeforeMinutes,
      COALESCE(a.buffer_after_minutes, s.buffer_after_minutes) AS bufferAfterMinutes,
      a.status, a.created_at AS submittedAt, a.updated_at AS updatedAt,
      pending.kind AS pendingKind, pending.proposed_starts_at AS pendingProposedStartsAt,
      pending.reason AS pendingReason, pending.created_at AS pendingCreatedAt,
      decided.kind AS lastDecisionKind, decided.status AS lastDecisionStatus, decided.decision_note AS lastDecisionNote
      FROM appointments a JOIN service_types s ON s.id = a.service_type_id
      LEFT JOIN appointment_change_requests pending ON pending.appointment_id = a.id AND pending.status = 'pending'
      LEFT JOIN appointment_change_requests decided ON decided.id = (
        SELECT id FROM appointment_change_requests
        WHERE appointment_id = a.id AND status IN ('approved','rejected')
        ORDER BY decided_at DESC, id DESC LIMIT 1)
      WHERE a.parishioner_user_id = ? ORDER BY a.starts_at DESC`)
      .bind(userId).all<AppointmentRow>(),
    db.prepare(`SELECT ds.id, ds.appointment_id AS appointmentId,
      ds.requirement_name AS label, ds.status, ds.is_required AS required,
      ds.original_file_name AS fileName, ds.mime_type AS mimeType,
      ds.size_bytes AS sizeBytes, ds.review_note AS note, ds.updated_at AS updatedAt
      FROM document_submissions ds
      JOIN appointments a ON a.id = ds.appointment_id
      WHERE a.parishioner_user_id = ? ORDER BY ds.created_at`)
      .bind(userId).all<DocumentRow>(),
    db.prepare(`SELECT ap.appointment_id AS appointmentId, ap.participant_type AS type,
      ap.full_name AS fullName, ap.date_of_birth AS dateOfBirth, ap.notes
      FROM appointment_participants ap
      JOIN appointments a ON a.id = ap.appointment_id
      WHERE a.parishioner_user_id = ? ORDER BY ap.created_at`)
      .bind(userId).all<ParticipantRow>(),
  ]);
  return appointments.results.map((row) => appointmentDto(row, documents.results, participants.results));
}

export async function loadMobileAppointment(actor: MobileActor, appointmentId: string) {
  const appointment = (await loadAppointments(actor.id)).find((item) => item.id === appointmentId);
  if (!appointment) throw new MobileServiceError('Appointment not found.', 404);
  return appointment;
}

async function loadNotifications(userId: string) {
  const result = await getRawDb().prepare(`SELECT id, title, body, type,
      entity_type AS entityType, entity_id AS entityId,
      read_at AS readAt, created_at AS createdAt
    FROM notifications WHERE recipient_user_id = ?
    ORDER BY created_at DESC LIMIT 100`).bind(userId).all<{
      id: string; title: string; body: string; type: string;
      entityType: string | null; entityId: string | null;
      readAt: string | null; createdAt: string;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: utcTimestamp(row.createdAt),
    ...(row.readAt ? { readAt: row.readAt } : {}),
    target: row.entityType === 'appointment' && row.entityId
      ? { kind: 'appointment', appointmentId: row.entityId }
      : row.entityType === 'queue'
        ? { kind: 'queue' }
        : row.type === 'assistant'
          ? { kind: 'assistant' }
          : { kind: 'home' },
  }));
}

async function activeQueueTicket(userId: string) {
  const row = await getRawDb().prepare(`SELECT id, ticket_number AS number,
      parish_id AS parishId, service, status, issued_at AS issuedAt,
      updated_at AS lastUpdatedAt, priority
    FROM queue_tickets WHERE parishioner_user_id = ? AND status IN ('waiting','serving')
    ORDER BY issued_at DESC LIMIT 1`).bind(userId).first<{
      id: string; number: string; parishId: string; service: string; status: string;
      issuedAt: string; lastUpdatedAt: string; priority: number;
    }>();
  if (!row) return undefined;
  const ahead = row.status === 'waiting'
    ? await getRawDb().prepare(`SELECT COUNT(*) AS count FROM queue_tickets
        WHERE parish_id = ? AND (
          status = 'serving' OR (status = 'waiting'
            AND (priority > ? OR (priority = ? AND issued_at < ?)))
        )`)
      .bind(row.parishId, row.priority, row.priority, row.issuedAt).first<{ count: number }>()
    : { count: 0 };
  const throughput = await getRawDb().prepare(`SELECT COUNT(*) AS sampleSize,
      AVG((julianday(served_at) - julianday(called_at)) * 1440.0) AS averageServiceMinutes
    FROM queue_tickets
    WHERE parish_id = ? AND status = 'served' AND called_at IS NOT NULL AND served_at IS NOT NULL
      AND datetime(served_at) >= datetime('now', '-30 days')
      AND (julianday(served_at) - julianday(called_at)) * 1440.0 BETWEEN 1 AND 180`)
    .bind(row.parishId).first<{ sampleSize: number; averageServiceMinutes: number | null }>();
  const peopleAhead = Number(ahead?.count ?? 0);
  const estimate = Number(throughput?.sampleSize ?? 0) >= 5 && throughput?.averageServiceMinutes
    ? Math.ceil(peopleAhead * Number(throughput.averageServiceMinutes))
    : null;
  return {
    id: row.id,
    number: row.number,
    parishId: row.parishId,
    service: row.service,
    status: row.status,
    ahead: peopleAhead,
    estimatedWaitMinutes: estimate,
    issuedAt: utcTimestamp(row.issuedAt),
    lastUpdatedAt: utcTimestamp(row.lastUpdatedAt),
  };
}

/** Published, unexpired announcements for the parishioner's home parish and the whole Vicariate. */
async function loadAnnouncements(actor: MobileActor) {
  const result = await getRawDb().prepare(`SELECT an.id, an.title, an.body, an.parish_id AS parishId,
      COALESCE(p.name, 'Vicariate-wide') AS parishName, an.published_at AS publishedAt
    FROM announcements an LEFT JOIN parishes p ON p.id = an.parish_id
    WHERE an.status = 'published' AND (an.parish_id IS NULL OR an.parish_id = ?)
      AND (an.expires_at IS NULL OR datetime(an.expires_at) > datetime('now'))
    ORDER BY an.published_at DESC LIMIT 20`).bind(actor.homeParishId).all<{
      id: string; title: string; body: string; parishId: string | null; parishName: string; publishedAt: string | null;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    scope: row.parishId ? 'parish' as const : 'vicariate' as const,
    parishName: row.parishName,
    publishedAt: utcTimestamp(row.publishedAt ?? ''),
  }));
}

export async function loadMobileSnapshot(actor: MobileActor) {
  // Due reminders are created before notifications are read so they appear immediately.
  await generateDueReminders({ userId: actor.id }).catch((error) => {
    recordServerFailure('reminder-generation', error);
    return 0;
  });
  const [appointments, notifications, queue, announcements] = await Promise.all([
    loadAppointments(actor.id),
    loadNotifications(actor.id),
    activeQueueTicket(actor.id),
    loadAnnouncements(actor),
  ]);
  return {
    source: 'api' as const,
    profile: {
      id: actor.id,
      displayName: actor.displayName,
      email: actor.email,
      mobileNumber: actor.mobileNumber,
      homeParishId: actor.homeParishId,
      notificationsEnabled: actor.notificationsEnabled,
    },
    appointments,
    notifications,
    announcements,
    ...(queue ? { activeQueueTicket: queue } : {}),
  };
}

function textField(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string') throw new MobileServiceError(`${name} is required.`);
  const result = value.trim();
  if (!result || result.length > max) throw new MobileServiceError(`${name} is invalid.`);
  return result;
}

/** Convert an offered date and slot (Asia/Manila) into an instant; shared by booking and reschedule requests. */
export function startsAtFromInput(date: string, time: string): Date {
  if (!validCalendarDate(date)) throw new MobileServiceError('Choose a valid appointment date.');
  if (!(MOBILE_TIME_SLOTS as readonly string[]).includes(time.trim())) throw new MobileServiceError('Choose one of the offered appointment times.');
  const match = /^(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)$/i.exec(time.trim());
  if (!match) throw new MobileServiceError('Choose a valid appointment time.');
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  const iso = `${date}T${String(hour).padStart(2, '0')}:${match[2]}:00+08:00`;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime()) || value.getTime() < Date.now() + 60 * 60 * 1000) {
    throw new MobileServiceError('Choose an appointment at least one hour in the future.');
  }
  if (value.getTime() > Date.now() + 180 * 24 * 60 * 60 * 1000) {
    throw new MobileServiceError('Appointments can be requested up to 180 days ahead.');
  }
  return value;
}

const MOBILE_TIME_SLOTS = ['8:00 AM', '9:30 AM', '11:00 AM', '1:30 PM', '3:00 PM', '4:30 PM'] as const;

export async function searchMobileAvailability(input: Record<string, unknown>) {
  const serviceTypeId = MOBILE_TO_SERVICE[textField(input.serviceId, 'Service', 60)];
  if (!serviceTypeId) throw new MobileServiceError('Choose a valid sacramental service.');
  const parishId = textField(input.parishId, 'Parish', 100);
  const clergyId = textField(input.clergyId, 'Clergy', 100);
  const venueId = textField(input.venueId, 'Venue', 100);
  const date = textField(input.date, 'Date', 10);
  if (!validCalendarDate(date)) throw new MobileServiceError('Choose a valid appointment date.');
  // When rescheduling, the parishioner's own appointment must not block its new slot.
  const excludeAppointmentId = typeof input.excludeAppointmentId === 'string' && input.excludeAppointmentId.length <= 100
    ? input.excludeAppointmentId : null;

  const db = getRawDb();
  const resource = await db.prepare(`SELECT s.duration_minutes AS durationMinutes,
      s.buffer_before_minutes AS bufferBeforeMinutes, s.buffer_after_minutes AS bufferAfterMinutes
    FROM service_types s
    JOIN clergy_profiles cp ON cp.id = ? AND cp.is_active = 1 AND EXISTS (SELECT 1 FROM users u WHERE u.id = cp.user_id AND u.is_active = 1)
      AND (cp.home_parish_id = ? OR cp.home_parish_id IS NULL)
    JOIN venues v ON v.id = ? AND v.parish_id = ? AND v.is_active = 1
    JOIN parishes p ON p.id = ? AND p.is_active = 1
    WHERE s.id = ? AND s.is_active = 1 LIMIT 1`)
    .bind(clergyId, parishId, venueId, parishId, parishId, serviceTypeId)
    .first<{ durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number }>();
  if (!resource) throw new MobileServiceError('That parish, priest, venue, or service is unavailable.', 409);

  const slots = await Promise.all(MOBILE_TIME_SLOTS.map(async (time) => {
    let start: Date;
    try {
      start = startsAtFromInput(date, time);
    } catch {
      return { time, available: false };
    }
    const end = new Date(start.getTime() + Number(resource.durationMinutes) * 60_000);
    const blockedStart = new Date(start.getTime() - Number(resource.bufferBeforeMinutes) * 60_000).toISOString();
    const blockedEnd = new Date(end.getTime() + Number(resource.bufferAfterMinutes) * 60_000).toISOString();
    const conflict = resourceConflict({ blockedStart, blockedEnd, clergyId, venueId, parishId, excludeAppointmentId });
    const row = await db.prepare(`SELECT ${conflict.sql} AS blocked`).bind(...conflict.values).first<{ blocked: number }>();
    return { time, available: !Boolean(row?.blocked) };
  }));
  return { slots };
}

type AppointmentParticipantInput = {
  type: string;
  fullName: string;
  dateOfBirth: string | null;
  notes: string | null;
};

function optionalTextField(value: unknown, name: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return textField(value, name, max);
}

function appointmentParticipants(value: unknown, actor: MobileActor): AppointmentParticipantInput[] {
  if (value === undefined) {
    return [{ type: 'requester', fullName: actor.displayName, dateOfBirth: null, notes: null }];
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new MobileServiceError('Add between 1 and 10 appointment participants.');
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new MobileServiceError(`Participant ${index + 1} is invalid.`);
    }
    const participant = item as Record<string, unknown>;
    const type = textField(participant.type, `Participant ${index + 1} type`, 40).toLowerCase();
    if (!/^[a-z][a-z0-9_-]*$/.test(type)) {
      throw new MobileServiceError(`Participant ${index + 1} type is invalid.`);
    }
    const fullName = textField(participant.fullName, `Participant ${index + 1} name`, 160).replace(/\s+/g, ' ');
    if (fullName.length < 2) throw new MobileServiceError(`Participant ${index + 1} name is invalid.`);
    const dateOfBirth = optionalTextField(participant.dateOfBirth, `Participant ${index + 1} birth date`, 10);
    if (dateOfBirth) {
      if (!validCalendarDate(dateOfBirth)) throw new MobileServiceError(`Participant ${index + 1} birth date is invalid.`);
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? new Date(`${dateOfBirth}T12:00:00Z`) : null;
      if (!parsed || Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() || parsed.getUTCFullYear() < 1900) {
        throw new MobileServiceError(`Participant ${index + 1} birth date is invalid.`);
      }
    }
    return {
      type,
      fullName,
      dateOfBirth,
      notes: optionalTextField(participant.notes, `Participant ${index + 1} notes`, 500),
    };
  });
}

type IdempotencyRow = {
  requestHash: string;
  resourceId: string | null;
};

async function findAppointmentIdempotency(
  actor: MobileActor,
  keyHash: string,
): Promise<IdempotencyRow | null> {
  return getRawDb().prepare(`SELECT request_hash AS requestHash, resource_id AS resourceId
    FROM idempotency_keys
    WHERE actor_id = ? AND scope = 'mobile.appointment.create' AND key_hash = ?
      AND datetime(expires_at) > datetime('now')`)
    .bind(actor.id, keyHash).first<IdempotencyRow>();
}

async function replayAppointment(
  actor: MobileActor,
  row: IdempotencyRow | null,
  requestHash: string,
) {
  if (!row) return null;
  if (row.requestHash !== requestHash) {
    throw new MobileServiceError('That Idempotency-Key was already used for a different appointment request.', 409);
  }
  if (!row.resourceId) throw new MobileServiceError('The earlier appointment request could not be recovered.', 409);
  return loadMobileAppointment(actor, row.resourceId);
}

export async function createMobileAppointment(
  actor: MobileActor,
  input: Record<string, unknown>,
  idempotencyKey: string,
) {
  const serviceTypeId = MOBILE_TO_SERVICE[textField(input.serviceId, 'Service', 60)];
  if (!serviceTypeId) throw new MobileServiceError('Choose a valid sacramental service.');
  const parishId = textField(input.parishId, 'Parish', 100);
  const clergyId = textField(input.clergyId, 'Clergy', 100);
  const venueId = textField(input.venueId, 'Venue', 100);
  const date = textField(input.date, 'Date', 10);
  const time = textField(input.time, 'Time', 12);
  const participants = appointmentParticipants(input.participants, actor);
  const start = startsAtFromInput(date, time);
  const db = getRawDb();
  const keyHash = await sha256Hex(idempotencyKey);
  const requestHash = await sha256Hex(JSON.stringify({
    serviceTypeId, parishId, clergyId, venueId, date, time: time.toUpperCase(), participants,
  }));
  await db.prepare(`DELETE FROM idempotency_keys
    WHERE actor_id = ? AND scope = 'mobile.appointment.create' AND key_hash = ?
      AND datetime(expires_at) <= datetime('now')`).bind(actor.id, keyHash).run();
  const replay = await replayAppointment(actor, await findAppointmentIdempotency(actor, keyHash), requestHash);
  if (replay) return replay;

  const resource = await db.prepare(`SELECT s.duration_minutes AS durationMinutes,
      s.buffer_before_minutes AS bufferBeforeMinutes, s.buffer_after_minutes AS bufferAfterMinutes,
      cp.display_title AS clergyName, v.name AS venueName
    FROM service_types s
    JOIN clergy_profiles cp ON cp.id = ? AND cp.is_active = 1 AND EXISTS (SELECT 1 FROM users u WHERE u.id = cp.user_id AND u.is_active = 1)
      AND (cp.home_parish_id = ? OR cp.home_parish_id IS NULL)
    JOIN venues v ON v.id = ? AND v.parish_id = ? AND v.is_active = 1
    JOIN parishes p ON p.id = ? AND p.is_active = 1
    WHERE s.id = ? AND s.is_active = 1 LIMIT 1`)
    .bind(clergyId, parishId, venueId, parishId, parishId, serviceTypeId)
    .first<{ durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number; clergyName: string; venueName: string }>();
  if (!resource) throw new MobileServiceError('That parish, priest, venue, or service is unavailable.', 409);

  const startsAt = start.toISOString();
  const endsAt = new Date(start.getTime() + Number(resource.durationMinutes) * 60_000).toISOString();
  const blockedStart = new Date(start.getTime() - Number(resource.bufferBeforeMinutes) * 60_000).toISOString();
  const blockedEnd = new Date(new Date(endsAt).getTime() + Number(resource.bufferAfterMinutes) * 60_000).toISOString();
  const appointmentId = crypto.randomUUID();
  const reference = `PL-${new Date().getUTCFullYear()}-${randomReference()}`;
  const requirements = await db.prepare(`SELECT id, name, instructions,
      is_required AS isRequired, updated_at AS updatedAt
    FROM document_requirements
    WHERE service_type_id = ? AND is_active = 1 ORDER BY sort_order, id`)
    .bind(serviceTypeId).all<{ id: string; name: string; instructions: string | null; isRequired: number; updatedAt: string }>();
  const checklistVersionId = `chk_${(await sha256Hex(JSON.stringify(requirements.results))).slice(0, 24)}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const conflict = resourceConflict({ blockedStart, blockedEnd, clergyId, venueId, parishId });
  const statements = [db.prepare(`INSERT INTO appointments
    (id, reference, parishioner_user_id, parishioner_name, service_type_id, checklist_version_id, parish_id,
      clergy_id, clergy_name, venue_id, venue_name, starts_at, ends_at, status,
      buffer_before_minutes, buffer_after_minutes)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?
    WHERE NOT ${conflict.sql}`)
    .bind(
      appointmentId, reference, actor.id, actor.displayName, serviceTypeId, checklistVersionId, parishId,
      clergyId, resource.clergyName, venueId, resource.venueName, startsAt, endsAt,
      Number(resource.bufferBeforeMinutes), Number(resource.bufferAfterMinutes),
      ...conflict.values,
    ),
    ...participants.map((participant) => db.prepare(`INSERT INTO appointment_participants
      (id, appointment_id, participant_type, full_name, date_of_birth, notes)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ?)`)
      .bind(crypto.randomUUID(), appointmentId, participant.type, participant.fullName,
        participant.dateOfBirth, participant.notes, appointmentId)),
    ...requirements.results.map((requirement) => db.prepare(`INSERT INTO document_submissions
      (id, appointment_id, requirement_id, requirement_name, requirement_instructions,
        is_required, checklist_version_id, status)
      SELECT ?, ?, ?, ?, ?, ?, ?, 'not_submitted'
      WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ?)`)
      .bind(crypto.randomUUID(), appointmentId, requirement.id, requirement.name, requirement.instructions,
        requirement.isRequired, checklistVersionId, appointmentId)),
    db.prepare(`INSERT INTO appointment_events
      (id, appointment_id, actor_id, event_type, to_status, detail)
      SELECT ?, ?, ?, 'request_submitted', 'submitted', 'Submitted by parishioner mobile app'
      WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ?)`)
      .bind(crypto.randomUUID(), appointmentId, actor.id, appointmentId),
    db.prepare(`INSERT INTO notifications
      (id, recipient_user_id, type, title, body, entity_type, entity_id)
      SELECT ?, ?, 'appointment', 'Request submitted', ?, 'appointment', ?
      WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ?)`)
      .bind(crypto.randomUUID(), actor.id, `${reference} was submitted. This is not yet parish approval.`, appointmentId, appointmentId),
    db.prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      SELECT ?, ?, 'mobile.appointment.create', 'appointment', ?, ?, 'success', ?
      WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ?)`)
      .bind(crypto.randomUUID(), actor.id, appointmentId, parishId, `${serviceTypeId}; ${startsAt}`, appointmentId),
    db.prepare(`INSERT INTO idempotency_keys
      (id, actor_id, scope, key_hash, request_hash, resource_id, response_status, expires_at)
      SELECT ?, ?, 'mobile.appointment.create', ?, ?, ?, 201, ?
      WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ?)`)
      .bind(crypto.randomUUID(), actor.id, keyHash, requestHash, appointmentId, expiresAt, appointmentId),
  ];

  let batchResults;
  try {
    batchResults = await db.batch(statements);
  } catch (error) {
    const racedReplay = await replayAppointment(actor, await findAppointmentIdempotency(actor, keyHash), requestHash);
    if (racedReplay) return racedReplay;
    throw error;
  }
  if (Number(batchResults[0]?.meta.changes ?? 0) !== 1) {
    const racedReplay = await replayAppointment(actor, await findAppointmentIdempotency(actor, keyHash), requestHash);
    if (racedReplay) return racedReplay;
    throw new MobileServiceError('That priest or venue is no longer available for the full service time. Choose another slot.', 409);
  }
  const appointments = await loadAppointments(actor.id);
  const result = appointments.find((appointment) => appointment.id === appointmentId);
  if (!result) throw new MobileServiceError('The appointment was safely submitted. Refresh your appointments to view it.', 503);
  return result;
}

function randomReference(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function markMobileNotificationRead(actor: MobileActor, notificationId: string): Promise<void> {
  const result = await getRawDb().prepare(`UPDATE notifications SET read_at = COALESCE(read_at, datetime('now'))
    WHERE id = ? AND recipient_user_id = ?`).bind(notificationId, actor.id).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new MobileServiceError('Notification not found.', 404);
}

export async function joinMobileQueue(
  actor: MobileActor,
  input: Record<string, unknown>,
  idempotencyKey: string,
) {
  const parishId = textField(input.parishId, 'Parish', 100);
  const service = textField(input.service, 'Queue service', 80);
  if (!QUEUE_SERVICES.has(service)) throw new MobileServiceError('Choose a valid queue service.');
  const db = getRawDb();
  const keyHash = await sha256Hex(idempotencyKey);
  const requestHash = await sha256Hex(JSON.stringify({ parishId, service }));
  await db.prepare(`DELETE FROM idempotency_keys
    WHERE actor_id = ? AND scope = 'mobile.queue.join' AND key_hash = ?
      AND datetime(expires_at) <= datetime('now')`).bind(actor.id, keyHash).run();
  const existing = await db.prepare(`SELECT request_hash AS requestHash, resource_id AS resourceId
    FROM idempotency_keys WHERE actor_id = ? AND scope = 'mobile.queue.join' AND key_hash = ?
      AND datetime(expires_at) > datetime('now')`)
    .bind(actor.id, keyHash).first<IdempotencyRow>();
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new MobileServiceError('That Idempotency-Key was already used for a different queue request.', 409);
    }
    const replay = await activeQueueTicket(actor.id);
    if (replay && replay.id === existing.resourceId) return replay;
    throw new MobileServiceError('That queue request has already finished. Request a new ticket with a new action.', 409);
  }
  const parish = await db.prepare('SELECT id FROM parishes WHERE id = ? AND is_active = 1').bind(parishId).first<{ id: string }>();
  if (!parish) throw new MobileServiceError('Choose a valid parish.');
  const id = crypto.randomUUID();
  const queueDate = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const number = `Q-${queueDate}-${randomReference()}`;
  const auditId = crypto.randomUUID();
  let results;
  try {
    results = await db.batch([
      db.prepare(`INSERT INTO queue_tickets
        (id, ticket_number, parish_id, parishioner_user_id, parishioner_name, service)
        SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
          SELECT 1 FROM queue_tickets WHERE parishioner_user_id = ? AND status IN ('waiting','serving')
        )`).bind(id, number, parishId, actor.id, actor.displayName, service, actor.id),
      db.prepare(`INSERT INTO audit_logs
        (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
        SELECT ?, ?, 'mobile.queue.join', 'queue_ticket', ?, ?, 'success', ? WHERE changes() = 1`)
        .bind(auditId, actor.id, id, parishId, service),
      db.prepare(`INSERT INTO idempotency_keys
        (id, actor_id, scope, key_hash, request_hash, resource_id, response_status, expires_at)
        SELECT ?, ?, 'mobile.queue.join', ?, ?, ?, 201, ?
        WHERE EXISTS (SELECT 1 FROM audit_logs WHERE id = ?)`)
        .bind(crypto.randomUUID(), actor.id, keyHash, requestHash, id,
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), auditId),
    ]);
  } catch (error) {
    const raced = await db.prepare(`SELECT request_hash AS requestHash, resource_id AS resourceId
      FROM idempotency_keys WHERE actor_id = ? AND scope = 'mobile.queue.join' AND key_hash = ?`)
      .bind(actor.id, keyHash).first<IdempotencyRow>();
    if (raced?.requestHash === requestHash) {
      const replay = await activeQueueTicket(actor.id);
      if (replay && replay.id === raced.resourceId) return replay;
    }
    throw error;
  }
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    const raced = await db.prepare(`SELECT request_hash AS requestHash, resource_id AS resourceId
      FROM idempotency_keys WHERE actor_id = ? AND scope = 'mobile.queue.join' AND key_hash = ?`)
      .bind(actor.id, keyHash).first<IdempotencyRow>();
    if (raced?.requestHash === requestHash) {
      const replay = await activeQueueTicket(actor.id);
      if (replay && replay.id === raced.resourceId) return replay;
    }
    throw new MobileServiceError('You already have an active walk-in ticket.', 409);
  }
  const ticket = await activeQueueTicket(actor.id);
  if (!ticket) throw new MobileServiceError('The queue ticket could not be loaded.', 500);
  return ticket;
}

export async function leaveMobileQueue(actor: MobileActor): Promise<void> {
  const db = getRawDb();
  await db.batch([
    db.prepare(`UPDATE queue_tickets SET status = 'cancelled',
      cancelled_at = datetime('now'), updated_at = datetime('now')
      WHERE parishioner_user_id = ? AND status IN ('waiting','serving')`).bind(actor.id),
    db.prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      SELECT ?, ?, 'mobile.queue.leave', 'queue_ticket', id, parish_id, 'success', 'Parishioner left queue'
      FROM queue_tickets WHERE parishioner_user_id = ? AND status = 'cancelled' AND changes() > 0
      ORDER BY cancelled_at DESC LIMIT 1`).bind(crypto.randomUUID(), actor.id, actor.id),
  ]);
}

export async function updateMobileProfile(actor: MobileActor, input: Record<string, unknown>): Promise<MobileProfile> {
  const displayName = textField(input.displayName, 'Complete name', 120).replace(/\s+/g, ' ');
  const mobileNumber = textField(input.mobileNumber, 'Mobile number', 20);
  const homeParishId = textField(input.homeParishId, 'Home parish', 100);
  if (displayName.length < 3) throw new MobileServiceError('Enter your complete name.');
  if (!validPhoneNumber(mobileNumber)) throw new MobileServiceError('Enter a valid mobile number.');
  if (input.email !== actor.email || input.id !== actor.id) throw new MobileServiceError('Account identity fields cannot be changed here.', 409);
  if (typeof input.notificationsEnabled !== 'boolean') throw new MobileServiceError('Notification preference is invalid.');
  const db = getRawDb();
  const parish = await db.prepare('SELECT id FROM parishes WHERE id = ? AND is_active = 1').bind(homeParishId).first<{ id: string }>();
  if (!parish) throw new MobileServiceError('Choose a valid home parish.');
  await db.batch([
    db.prepare(`UPDATE users SET full_name = ?, phone = ?, home_parish_id = ?,
      updated_at = datetime('now') WHERE id = ?`).bind(displayName, mobileNumber, homeParishId, actor.id),
    db.prepare(`UPDATE mobile_credentials SET notifications_enabled = ?,
      updated_at = datetime('now') WHERE user_id = ?`).bind(input.notificationsEnabled ? 1 : 0, actor.id),
  ]);
  return { id: actor.id, displayName, email: actor.email, mobileNumber, homeParishId, notificationsEnabled: input.notificationsEnabled, emailVerified: Boolean(actor.emailVerified) };
}

function redactAssistantText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
    .replace(/(?:\+?63|0)\s*9\d{2}[\s-]?\d{3}[\s-]?\d{4}/g, '[phone removed]')
    .replace(/\bPL-\d{4}-[A-Z0-9-]+\b/gi, '[request reference removed]')
    .replace(/\bQ-[A-Z0-9-]+\b/gi, '[queue number removed]')
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4,8}\b/g, '[number removed]')
    .slice(0, 500);
}

type AssistantServiceId = 'baptism' | 'wedding' | 'confirmation' | 'first_communion' | 'funeral';
type AssistantServerServiceId = 'baptism' | 'wedding' | 'confirmation' | 'first-communion' | 'funeral-mass';
type AssistantActionKind = 'service' | 'appointment' | 'documents' | 'queue' | 'home' | 'contact_parish';
type AssistantSourceKind = 'service_requirements' | 'appointment' | 'queue' | 'parish_directory';

type AssistantAction = {
  id: string;
  label: string;
  kind: AssistantActionKind;
  serviceId?: AssistantServiceId;
  appointmentId?: string;
};

type AssistantSource = {
  label: string;
  kind: AssistantSourceKind;
  updatedAt?: string;
};

type AssistantClarification = {
  question: string;
  options: Array<{
    id: string;
    label: string;
    prompt: string;
    serviceId?: AssistantServiceId;
  }>;
};

type AssistantReply = {
  text: string;
  category: string;
  escalation: boolean;
  title?: string;
  bullets?: string[];
  sources?: AssistantSource[];
  actions?: AssistantAction[];
  followUpPrompts?: string[];
  clarification?: AssistantClarification;
};

type AssistantService = {
  serverId: AssistantServerServiceId;
  mobileId: AssistantServiceId;
  name: string;
  aliases: RegExp;
};

const ASSISTANT_SERVICES: AssistantService[] = [
  {
    serverId: 'baptism',
    mobileId: 'baptism',
    name: 'Baptism',
    aliases: /\b(?:baptism|baptize|baptise|christening|binyag)\b/i,
  },
  {
    serverId: 'wedding',
    mobileId: 'wedding',
    name: 'Wedding',
    aliases: /\b(?:wedding|marriage|matrimony|kasal)\b/i,
  },
  {
    serverId: 'confirmation',
    mobileId: 'confirmation',
    name: 'Confirmation',
    aliases: /\b(?:confirmation|kumpil)\b/i,
  },
  {
    serverId: 'first-communion',
    mobileId: 'first_communion',
    name: 'First Communion',
    aliases: /\b(?:(?:first|holy)\s+communion|communion|komunyon)\b/i,
  },
  {
    serverId: 'funeral-mass',
    mobileId: 'funeral',
    name: 'Funeral Mass',
    aliases: /\b(?:funeral(?:\s+mass)?|burial|libing)\b/i,
  },
];

const DOCUMENT_QUESTION =
  /\b(?:document|documents|requirement|requirements|checklist|certificate|certificates|paperwork|papers|upload)\b|\bwhat\s+(?:do|will|would)\s+i\s+need\b/i;
const EXACT_CHECKLIST_QUESTION =
  /\b(?:what|which)\s+(?:are\s+the\s+)?(?:documents?|requirements?|certificates?|paperwork|papers)\b|\b(?:checklist|requirements)\b|\bwhat\s+(?:do|will|would)\s+i\s+need\b/i;
const APPOINTMENT_QUESTION =
  /\b(?:my|our)\b.{0,40}\b(?:appointment|request|application|status|documents?)\b|\b(?:appointment|request|application)\s+status\b|\b(?:track|check)\s+(?:my|our)\b/i;
const QUEUE_QUESTION = /\b(?:queue|walk[ -]?in|ticket|people ahead|waiting time)\b/i;
const HUMAN_SUPPORT_QUESTION =
  /\b(?:abuse|danger|emergency|suicid\w*|self[ -]?harm|legal advice|financial advice|medical advice|canon law|annulment|dispensation|eligible|eligibility)\b|\b(?:can|could|will|would)\s+you\s+(?:please\s+)?(?:approve|reject|verify|book|cancel|change|submit)\b/i;

function detectAssistantService(prompt: string): AssistantService | undefined {
  return ASSISTANT_SERVICES.find((service) => service.aliases.test(prompt));
}

function readableTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(date);
}

function serviceActions(service: AssistantService): AssistantAction[] {
  return [
    {
      id: `view-${service.mobileId}`,
      label: `View ${service.name}`,
      kind: 'service',
      serviceId: service.mobileId,
    },
    {
      id: `book-${service.mobileId}`,
      label: 'Start a request',
      kind: 'service',
      serviceId: service.mobileId,
    },
  ];
}

async function serviceGuidance(service: AssistantService, wantsRequirements: boolean): Promise<AssistantReply> {
  const db = getRawDb();
  const [serviceRow, requirements] = await Promise.all([
    db.prepare(`SELECT name, description, updated_at AS updatedAt
      FROM service_types WHERE id = ? AND is_active = 1 LIMIT 1`)
      .bind(service.serverId).first<{ name: string; description: string | null; updatedAt: string }>(),
    db.prepare(`SELECT name, instructions, is_required AS isRequired, updated_at AS updatedAt
      FROM document_requirements
      WHERE service_type_id = ? AND is_active = 1
      ORDER BY sort_order, name`).bind(service.serverId).all<{
        name: string;
        instructions: string | null;
        isRequired: number;
        updatedAt: string;
      }>(),
  ]);
  const name = serviceRow?.name ?? service.name;
  const requirementRows = requirements.results;
  const lastUpdated = [serviceRow?.updatedAt, ...requirementRows.map((row) => row.updatedAt)]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const bullets = requirementRows.map((requirement) =>
    `${requirement.name}${requirement.isRequired ? '' : ' (optional)'}`,
  );
  const hasRequirements = bullets.length > 0;
  const escalation = service.serverId === 'funeral-mass';

  if (wantsRequirements) {
    return {
      title: `${name} document checklist`,
      text: hasRequirements
        ? `These are the current ${name} requirements published in ParishLink. Parish staff must verify each submission and make the final decision.`
        : `No active ${name} document requirements are currently published in ParishLink. Please contact the parish office before submitting a request.`,
      category: service.serverId,
      escalation,
      ...(hasRequirements ? { bullets } : {}),
      sources: [{
        label: `Current ${name} requirements`,
        kind: 'service_requirements',
        ...(lastUpdated ? { updatedAt: lastUpdated } : {}),
      }],
      actions: [
        ...serviceActions(service),
        ...(escalation ? [{ id: 'contact-parish', label: 'Contact parish office', kind: 'contact_parish' as const }] : []),
      ],
      followUpPrompts: [
        `How do I start a ${name} request?`,
        'How does document verification work?',
      ],
    };
  }

  return {
    title: name,
    text: serviceRow?.description?.trim()
      || `ParishLink helps you review the ${name} checklist and submit a request. Submission is not approval; authorized parish personnel verify documents and make the final decision.`,
    category: service.serverId,
    escalation,
    ...(hasRequirements ? { bullets: [`${bullets.length} active document requirement${bullets.length === 1 ? '' : 's'}`] } : {}),
    sources: [{
      label: `Current ${name} information`,
      kind: 'service_requirements',
      ...(serviceRow?.updatedAt ? { updatedAt: serviceRow.updatedAt } : {}),
    }],
    actions: [
      ...serviceActions(service),
      ...(escalation ? [{ id: 'contact-parish', label: 'Contact parish office', kind: 'contact_parish' as const }] : []),
    ],
    followUpPrompts: [`What documents do I need for ${name}?`],
  };
}

type AssistantAppointmentRow = {
  id: string;
  serviceName: string;
  parishName: string;
  startsAt: string;
  status: string;
  updatedAt: string;
};

type AssistantDocumentRow = {
  label: string;
  status: string;
  required: number;
};

function appointmentStatusGuidance(status: string): { label: string; explanation: string } {
  switch (status) {
    case 'submitted':
      return { label: 'Submitted', explanation: 'The parish has received the request. It is not yet approved.' };
    case 'documents_pending':
      return { label: 'Documents pending', explanation: 'The request is waiting for required documents or document review.' };
    case 'under_review':
      return { label: 'Under review', explanation: 'Authorized parish staff are reviewing the request and submitted documents.' };
    case 'needs_changes':
      return { label: 'Needs action', explanation: 'At least one item needs your attention before review can continue.' };
    case 'ready_to_approve':
      return { label: 'Awaiting final decision', explanation: 'Initial review is complete, but an authorized person must still make the final decision.' };
    case 'approved':
      return { label: 'Approved', explanation: 'ParishLink currently records the request as approved by authorized parish personnel.' };
    case 'completed':
      return { label: 'Completed', explanation: 'ParishLink currently records the request as completed.' };
    case 'rejected':
      return { label: 'Not approved', explanation: 'ParishLink records that the parish did not approve this request.' };
    case 'cancelled':
      return { label: 'Cancelled', explanation: 'This request is recorded as cancelled.' };
    case 'no_show':
      return { label: 'Missed appointment', explanation: 'This request is recorded as a missed appointment.' };
    default:
      return { label: 'Status available', explanation: 'Open the request to see its current status and next step.' };
  }
}

async function appointmentGuidance(
  actor: MobileActor,
  appointmentId?: string,
  serviceTypeId?: AssistantService['serverId'],
): Promise<AssistantReply> {
  const db = getRawDb();
  const requestedId = appointmentId && /^[a-zA-Z0-9_-]{1,100}$/.test(appointmentId) ? appointmentId : '';
  const requestedService = serviceTypeId ?? '';
  const requestedServiceName = ASSISTANT_SERVICES.find((service) => service.serverId === requestedService)?.name;
  const appointment = await db.prepare(`SELECT a.id, s.name AS serviceName, p.name AS parishName,
      a.starts_at AS startsAt, a.status, a.updated_at AS updatedAt
    FROM appointments a
    JOIN service_types s ON s.id = a.service_type_id
    JOIN parishes p ON p.id = a.parish_id
    WHERE a.parishioner_user_id = ? AND (? = '' OR a.id = ?)
      AND (? = '' OR a.service_type_id = ?)
    ORDER BY datetime(a.updated_at) DESC, datetime(a.created_at) DESC
    LIMIT 1`).bind(actor.id, requestedId, requestedId, requestedService, requestedService).first<AssistantAppointmentRow>();

  if (!appointment) {
    return {
      title: requestedId ? 'Request not available' : requestedServiceName ? `No ${requestedServiceName} request found` : 'No requests yet',
      text: requestedId
        ? 'That request is not available in your signed-in account. Open My Appointments to choose one of your requests.'
        : requestedServiceName
          ? `You do not have a ${requestedServiceName} request in this account. Open My Appointments to review your other requests, or start a new one from Services.`
          : 'You do not have an appointment request yet. Choose a service to review its checklist and start a request.',
      category: 'appointment-status',
      escalation: false,
      actions: [
        { id: 'view-appointments', label: 'My appointments', kind: 'appointment' },
        { id: 'view-services', label: 'Browse services', kind: 'service' },
      ],
      followUpPrompts: ['What documents do I need?'],
    };
  }

  const documents = await db.prepare(`SELECT ds.requirement_name AS label, ds.status,
      COALESCE(dr.is_required, 1) AS required
    FROM document_submissions ds
    LEFT JOIN document_requirements dr ON dr.id = ds.requirement_id
    WHERE ds.appointment_id = ?
    ORDER BY COALESCE(dr.sort_order, 999), ds.requirement_name`)
    .bind(appointment.id).all<AssistantDocumentRow>();
  const requiredDocuments = documents.results.filter((document) => Boolean(document.required));
  const verified = requiredDocuments.filter((document) => document.status === 'verified');
  const missing = requiredDocuments.filter((document) => document.status === 'not_submitted');
  const replacement = requiredDocuments.filter((document) => document.status === 'needs_replacement');
  const inReview = requiredDocuments.filter((document) => document.status === 'submitted');
  const status = appointmentStatusGuidance(appointment.status);
  const bullets = [
    `Status: ${status.label}`,
    `Schedule: ${readableTimestamp(appointment.startsAt)}`,
    ...(requiredDocuments.length
      ? [`Documents verified: ${verified.length} of ${requiredDocuments.length}`]
      : ['No document checklist is attached to this request.']),
    ...missing.map((document) => `Missing: ${document.label}`),
    ...replacement.map((document) => `Needs replacement: ${document.label}`),
    ...inReview.map((document) => `Submitted for staff review: ${document.label}`),
  ];

  return {
    title: `Latest ${appointment.serviceName} request`,
    text: `${status.explanation} Open the request for its full details and any next action.`,
    category: 'appointment-status',
    escalation: false,
    bullets,
    sources: [{
      label: `Your ${appointment.serviceName} request at ${appointment.parishName}`,
      kind: 'appointment',
      updatedAt: appointment.updatedAt,
    }],
    actions: [{
      id: 'view-appointment',
      label: missing.length || replacement.length ? 'Open request and documents' : 'View appointment',
      kind: missing.length || replacement.length ? 'documents' : 'appointment',
      appointmentId: appointment.id,
    }],
    followUpPrompts: [
      ...(missing.length || replacement.length ? ['What should I do with a missing document?'] : []),
      'How does parish approval work?',
    ],
  };
}

async function queueGuidance(actor: MobileActor): Promise<AssistantReply> {
  const ticket = await activeQueueTicket(actor.id);
  if (!ticket) {
    return {
      title: 'Walk-in queue',
      text: 'You do not have an active walk-in ticket. Open Walk-in Queue, choose a parish and purpose, then take one ticket. Wait estimates can change as staff serve visitors.',
      category: 'queue',
      escalation: false,
      actions: [{ id: 'open-queue', label: 'Open walk-in queue', kind: 'queue' }],
      followUpPrompts: ['What can I use the walk-in queue for?'],
    };
  }

  const parish = await getRawDb().prepare(`SELECT name FROM parishes
    WHERE id = ? AND is_active = 1 LIMIT 1`).bind(ticket.parishId).first<{ name: string }>();
  const isServing = ticket.status === 'serving';
  const estimateText = ticket.estimatedWaitMinutes === null
    ? 'A reliable wait estimate is not available yet because this parish has fewer than five recent completed tickets.'
    : `The measured wait estimate is ${ticket.estimatedWaitMinutes} minutes and may change.`;
  return {
    title: `Walk-in ticket ${ticket.number}`,
    text: isServing
      ? 'Your ticket is currently being served. Please follow the parish staff or counter instructions shown in the queue.'
      : `Your ticket is waiting with ${ticket.ahead} ${ticket.ahead === 1 ? 'person' : 'people'} ahead. ${estimateText}`,
    category: 'queue',
    escalation: false,
    bullets: [
      `Purpose: ${ticket.service}`,
      ...(parish?.name ? [`Parish: ${parish.name}`] : []),
      `Status: ${isServing ? 'Now serving' : 'Waiting'}`,
      ...(!isServing ? [
        `People ahead: ${ticket.ahead}`,
        ticket.estimatedWaitMinutes === null
          ? 'Wait estimate: not enough recent completed tickets'
          : `Measured wait estimate: ${ticket.estimatedWaitMinutes} minutes`,
      ] : []),
    ],
    sources: [{
      label: 'Your live ParishLink queue ticket',
      kind: 'queue',
      updatedAt: ticket.lastUpdatedAt,
    }],
    actions: [{ id: 'view-queue-ticket', label: 'View queue ticket', kind: 'queue' }],
    followUpPrompts: ['Why can the wait estimate change?'],
  };
}

function documentClarification(): AssistantReply {
  return {
    title: 'Which service do you need?',
    text: 'Document requirements are different for each service. Choose one so I can show the exact current checklist from ParishLink.',
    category: 'document-clarification',
    escalation: false,
    bullets: ASSISTANT_SERVICES.map((service) => service.name),
    clarification: {
      question: 'Which service are you preparing for?',
      options: ASSISTANT_SERVICES.map((service) => ({
        id: service.mobileId,
        label: service.name,
        prompt: `What documents do I need for ${service.name}?`,
        serviceId: service.mobileId,
      })),
    },
    actions: [{ id: 'view-services', label: 'Browse all services', kind: 'service' }],
    followUpPrompts: ASSISTANT_SERVICES.map((service) => `${service.name} document requirements`),
  };
}

async function parishOfficeGuidance(actor: MobileActor): Promise<AssistantReply> {
  const parish = await getRawDb().prepare(`SELECT name, address, office_hours AS officeHours,
      contact_phone AS contactPhone, contact_email AS contactEmail,
      updated_at AS updatedAt FROM parishes WHERE id = ? AND is_active = 1 LIMIT 1`)
    .bind(actor.homeParishId).first<{
      name: string;
      address: string | null;
      officeHours: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      updatedAt: string;
    }>();
  const hasPublishedDirectory = Boolean(parish && (parish.address || parish.officeHours || parish.contactPhone || parish.contactEmail));
  return {
    title: parish?.name ?? 'Contact your parish',
    text: parish
      ? 'Here is the public office information currently listed for your home parish. Contact the office for official decisions, pastoral questions, or details not published in ParishLink.'
      : 'Contact your parish office for official decisions, pastoral questions, or details not published in ParishLink.',
    category: 'parish-office',
    escalation: false,
    ...(parish ? {
      bullets: [
        ...(parish.address ? [`Address: ${parish.address}`] : []),
        ...(parish.officeHours ? [`Office hours: ${parish.officeHours}`] : []),
        ...(parish.contactPhone ? [`Phone: ${parish.contactPhone}`] : []),
        ...(parish.contactEmail ? [`Email: ${parish.contactEmail}`] : []),
        ...(!hasPublishedDirectory ? ['No address or office hours are currently published.'] : []),
      ],
      sources: [{
        label: `${parish.name} public office information`,
        kind: 'parish_directory',
        updatedAt: parish.updatedAt,
      }],
    } : {}),
    actions: [{ id: 'contact-parish', label: 'Contact parish office', kind: 'contact_parish' }],
  };
}

function humanSupportGuidance(): AssistantReply {
  return {
    title: 'Please contact a person who can help',
    text: 'This needs human support. Please contact your parish office or an appropriate emergency or professional service. ParishLink cannot make pastoral, canonical, legal, financial, medical, or emergency decisions.',
    category: 'human-support',
    escalation: true,
    actions: [{ id: 'contact-parish', label: 'Contact parish office', kind: 'contact_parish' }],
  };
}

function knownGeneralGuidance(prompt: string): AssistantReply | null {
  if (/\b(?:book|booking|schedule|make|start|submit)\b.{0,30}\b(?:appointment|request)\b|\bhow\s+(?:do|can)\s+i\s+(?:book|schedule|start|submit)\b/i.test(prompt)) {
    return {
      title: 'Start a parish request',
      text: 'Choose a service, review its current checklist, select the available parish resources and schedule, then submit. Submission is not approval; authorized parish personnel verify the request.',
      category: 'booking',
      escalation: false,
      bullets: ['Choose a service', 'Review its document checklist', 'Select parish, priest, venue, date, and time', 'Submit for parish review'],
      actions: [
        { id: 'browse-services', label: 'Browse services', kind: 'service' },
      ],
      followUpPrompts: ['What documents do I need?'],
    };
  }
  if (/\b(?:notification|notifications|alert|alerts)\b/i.test(prompt)) {
    return {
      title: 'ParishLink notifications',
      text: 'Notifications explain updates to your own requests and queue activity. Open the notification to view the related item, and confirm important changes with the parish office when needed.',
      category: 'notifications',
      escalation: false,
      actions: [{ id: 'view-appointments', label: 'My appointments', kind: 'appointment' }],
    };
  }
  if (/\b(?:approve|approval|verification|verify|review process)\b/i.test(prompt)) {
    return {
      title: 'Verification and approval',
      text: 'ParishLink records submissions and review progress. Only authorized parish personnel verify documents and make final decisions; the assistant cannot approve, reject, or change a request.',
      category: 'approval-process',
      escalation: false,
      actions: [{ id: 'view-appointments', label: 'My appointments', kind: 'appointment' }],
      followUpPrompts: ['What is the status of my latest request?'],
    };
  }
  if (/\b(?:five services|services available|what services|sacraments)\b/i.test(prompt)) {
    return {
      title: 'ParishLink services',
      text: 'ParishLink currently supports five parish service request types. Open a service to see its current information and checklist.',
      category: 'services',
      escalation: false,
      bullets: ASSISTANT_SERVICES.map((service) => service.name),
      sources: [{ label: 'ParishLink service catalogue', kind: 'service_requirements' }],
      actions: [{ id: 'view-services', label: 'Browse services', kind: 'service' }],
      followUpPrompts: ASSISTANT_SERVICES.map((service) => `What do I need for ${service.name}?`),
    };
  }
  if (/^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening))[!.\s]*$/i.test(prompt)) {
    return {
      title: 'How can I help?',
      text: 'I can show current service checklists, explain your latest request status, and check your active walk-in queue. Parish staff remain responsible for verification and final decisions.',
      category: 'greeting',
      escalation: false,
      actions: [
        { id: 'view-services', label: 'Browse services', kind: 'service' },
        { id: 'view-appointments', label: 'My appointments', kind: 'appointment' },
        { id: 'open-queue', label: 'Walk-in queue', kind: 'queue' },
      ],
      followUpPrompts: ['What documents do I need?', 'What is my latest request status?', 'Check my queue ticket'],
    };
  }
  return null;
}

function generalFallbackGuidance(): AssistantReply {
  return {
    title: 'ParishLink assistant',
    text: 'I can explain ParishLink services, document checklists, your request statuses, notifications, and your walk-in queue. Final verification, pastoral guidance, and approvals always come from authorized parish personnel.',
    category: 'general',
    escalation: false,
    actions: [
      { id: 'view-services', label: 'Browse services', kind: 'service' },
      { id: 'view-appointments', label: 'My appointments', kind: 'appointment' },
      { id: 'open-queue', label: 'Walk-in queue', kind: 'queue' },
    ],
    followUpPrompts: ['What documents do I need?', 'What is my latest request status?'],
  };
}

async function publicAssistantKnowledge(): Promise<PublicKnowledgeSource[]> {
  // Select public fields explicitly. Never reuse snapshot/profile/record queries.
  const db = getRawDb();
  const [services, parishes] = await Promise.all([
    db.prepare('SELECT name, description FROM service_types WHERE is_active = 1 ORDER BY name LIMIT 10')
      .all<{ name: string; description: string | null }>(),
    db.prepare('SELECT name, address, office_hours AS officeHours FROM parishes WHERE is_active = 1 ORDER BY name LIMIT 12')
      .all<{ name: string; address: string | null; officeHours: string | null }>(),
  ]);
  return [
    {
      id: 'services',
      content: JSON.stringify(services.results.map(service => ({
        name: service.name.slice(0, 100), description: service.description?.slice(0, 700) ?? 'No description published.',
      }))),
    },
    {
      id: 'directory',
      content: JSON.stringify(parishes.results.map(parish => ({
        name: parish.name.slice(0, 150), address: parish.address?.slice(0, 200) ?? 'Not published.',
        officeHours: parish.officeHours?.slice(0, 200) ?? 'Not published.',
      }))),
    },
    {
      id: 'navigation',
      content: 'Parishioners use the mobile application. Services shows the current service information and exact document checklist. Start a request from Services, select available parish/clergy/venue/date/time, and submit for parish review. Submission does not mean approval. My Appointments shows the signed-in user their own request status and documents. Document upload is followed by authorized parish staff review; a replacement may be requested. Final approval and sacramental decisions belong to authorized parish staff/clergy. Walk-in Queue supports one active ticket; staff call and serve visitors; any wait estimate may change. Notifications contains in-app updates to requests and queue activity; external push availability depends on device permission and provider configuration. Profile manages account preferences. Staff and clergy use the separate internal portal with assigned parish/role access. The system supports administration and does not replace official Church archives or pastoral decisions. No payments, donations, live streaming or official eligibility judgments are available in the assistant. No fee schedule or guaranteed response time is published in this guidance.',
    },
  ];
}

export async function askMobileAssistant(actor: MobileActor, input: Record<string, unknown>) {
  const prompt = textField(input.prompt, 'Question', 500);
  const redactedPrompt = redactAssistantText(prompt);
  const service = detectAssistantService(redactedPrompt);
  const requestedAppointmentId = typeof input.appointmentId === 'string' ? input.appointmentId.trim() : undefined;
  let reply: AssistantReply;

  if (HUMAN_SUPPORT_QUESTION.test(redactedPrompt)) {
    reply = humanSupportGuidance();
  } else if (APPOINTMENT_QUESTION.test(redactedPrompt)) {
    reply = await appointmentGuidance(actor, requestedAppointmentId, service?.serverId);
  } else if (QUEUE_QUESTION.test(redactedPrompt)) {
    reply = await queueGuidance(actor);
  } else if (service) {
    reply = await serviceGuidance(service, DOCUMENT_QUESTION.test(redactedPrompt));
  } else if (EXACT_CHECKLIST_QUESTION.test(redactedPrompt)) {
    reply = documentClarification();
  } else if (/\b(?:parish office|office hours|contact|address|location)\b/i.test(redactedPrompt)) {
    reply = await parishOfficeGuidance(actor);
  } else {
    reply = knownGeneralGuidance(redactedPrompt) ?? generalFallbackGuidance();
  }

  let provider: 'parishlink' | 'gemini' = 'parishlink';
  let fallbackReason: AssistantFallbackReason | undefined;
  const configuration = {
    enabled: env.GEMINI_ENABLED, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL,
  };
  // Live data, exact checklists and official decisions are never model inputs.
  // Check the ORIGINAL question before any redaction so redaction cannot conceal
  // an identifier and accidentally make a private question provider-eligible.
  const liveQueueQuestion = reply.category === 'queue'
    && (/\b(?:my|our|check|show|track|current|now|ahead)\b|\bhow\s+(?:long|many)\b/i.test(prompt));
  const localOnly = ['appointment-status', 'human-support', 'parish-office', 'document-clarification'].includes(reply.category)
    || liveQueueQuestion
    || (Boolean(service) && EXACT_CHECKLIST_QUESTION.test(redactedPrompt));
  const eligibility = publicGeminiEligibility(prompt, input.allowExternalAI, configuration);
  fallbackReason = localOnly ? 'private_or_sensitive' : eligibility ?? undefined;
  if (!localOnly && !eligibility) {
    let generated: Awaited<ReturnType<typeof generatePublicAssistantReply>>;
    try {
      generated = await generatePublicAssistantReply(
        prompt, input.allowExternalAI, await publicAssistantKnowledge(), configuration, fetch,
        diagnostic => {
          const failure = new Error();
          failure.name = diagnostic.stage === 'http' ? `GeminiHttp${diagnostic.status}`
            : diagnostic.stage === 'network' ? 'GeminiNetworkFailure' : 'GeminiInvalidResponse';
          recordServerFailure(`assistant-provider-${diagnostic.stage}`, failure);
        },
      );
    } catch (error) {
      // A failed optional public-context lookup must not discard local guidance.
      recordServerFailure('assistant-public-context', error);
      generated = { provider: 'parishlink', fallbackReason: 'unavailable' };
    }
    if (generated.provider === 'gemini') {
      provider = 'gemini';
      const sourceLabels = {
        services: { label: 'ParishLink public service catalogue', kind: 'service_requirements' as const },
        directory: { label: 'ParishLink public parish directory', kind: 'parish_directory' as const },
        navigation: { label: 'ParishLink service and navigation guide', kind: 'service_requirements' as const },
      };
      reply = {
        title: 'Gemini-assisted guidance',
        text: generated.text + '\n\nConfirm final requirements and decisions with the parish office.',
        category: 'public-guidance', escalation: generated.needsHuman,
        sources: generated.sourceIds.map(id => sourceLabels[id]),
        actions: generated.needsHuman
          ? [{ id: 'contact-parish', label: 'Contact parish office', kind: 'contact_parish' }]
          : service ? serviceActions(service)
            : [{ id: 'view-services', label: 'Browse services', kind: 'service' }],
        followUpPrompts: ['How do I start a request?', 'How does document verification work?'],
      };
    } else {
      fallbackReason = generated.fallbackReason;
    }
  }

  // Single-turn questions are processed in memory, with no transcript storage.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    from: 'assistant' as const,
    text: reply.text,
    provider,
    ...(fallbackReason ? { fallbackReason } : {}),
    createdAt: now,
    ...(reply.title ? { title: reply.title } : {}),
    ...(reply.bullets?.length ? { bullets: reply.bullets } : {}),
    ...(reply.sources?.length ? { sources: reply.sources } : {}),
    ...(reply.actions?.length ? { actions: reply.actions } : {}),
    ...(reply.followUpPrompts?.length ? { followUpPrompts: reply.followUpPrompts } : {}),
    ...(reply.clarification ? { clarification: reply.clarification } : {}),
    ...(reply.escalation ? { escalation: true } : {}),
  };
}
