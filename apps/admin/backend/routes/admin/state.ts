import { getStaffUser } from '@/backend/auth/staff-session';
import { AdminServiceError, loadDashboardState, performAdminMutation, resolveActor } from '@/backend/services/admin-service';
import { recordServerFailure } from '@/backend/observability/server-log';
import { validIdempotencyKey } from '@/backend/security/idempotency';
import { readSmallJson, RequestBodyError } from '@/backend/http/small-json';
import { schedulePushDispatch } from '@/backend/notifications/background-dispatch';
import {
  APPOINTMENT_STATUSES,
  type AdminMutation,
  type AppointmentStatus,
} from '@/shared/domain';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown, name: string, max: number, required = true): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AdminServiceError(`${name} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') throw new AdminServiceError(`${name} must be text.`);
  const result = value.trim();
  if (required && !result) throw new AdminServiceError(`${name} is required.`);
  if (result.length > max) throw new AdminServiceError(`${name} is too long.`);
  return result || undefined;
}

function parseMutation(value: unknown): AdminMutation {
  if (!isRecord(value)) throw new AdminServiceError('Invalid request body.');
  const action = stringField(value.action, 'Action', 60);
  switch (action) {
    case 'appointment.transition': {
      const appointmentId = stringField(value.appointmentId, 'Appointment', 100) as string;
      const status = stringField(value.status, 'Status', 40) as AppointmentStatus;
      if (!APPOINTMENT_STATUSES.includes(status)) throw new AdminServiceError('Unknown appointment status.');
      const expectedVersion = value.expectedVersion;
      if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) throw new AdminServiceError('A valid appointment version is required.');
      return {
        action,
        appointmentId,
        status,
        expectedVersion: Number(expectedVersion),
        reason: stringField(value.reason, 'Reason', 500, false),
      };
    }
    case 'document.review': {
      if (typeof value.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.expectedSha256)) throw new AdminServiceError('Refresh and open the current document before reviewing.');
      const status = stringField(value.status, 'Status', 40);
      if (status !== 'verified' && status !== 'needs_replacement') throw new AdminServiceError('Unknown document decision.');
      return {
        action,
        documentId: stringField(value.documentId, 'Document', 160) as string,
        expectedSha256: value.expectedSha256,
        status,
        note: stringField(value.note, 'Review note', 500, false),
      };
    }
    case 'queue.call_next':
      return {
        action,
        parishId: stringField(value.parishId, 'Parish', 100) as string,
        counter: stringField(value.counter, 'Counter', 40) as string,
      };
    case 'queue.complete':
      return { action, ticketId: stringField(value.ticketId, 'Ticket', 100) as string };
    case 'queue.cancel': {
      const status = stringField(value.status, 'Queue status', 20);
      if (status !== 'cancelled' && status !== 'no_show') {
        throw new AdminServiceError('Choose cancelled or no-show for the queue ticket.');
      }
      return {
        action,
        ticketId: stringField(value.ticketId, 'Ticket', 100) as string,
        status,
      };
    }
    case 'walkin.appointment.create':
      return {
        action,
        parishId: stringField(value.parishId, 'Parish', 100) as string,
        ticketId: stringField(value.ticketId, 'Queue ticket', 100, false) ?? null,
        parishionerName: stringField(value.parishionerName, 'Visitor name', 120) as string,
        contactPhone: stringField(value.contactPhone, 'Contact phone', 30, false) ?? null,
        participantName: stringField(value.participantName, 'Participant name', 160, false) ?? null,
        serviceTypeId: stringField(value.serviceTypeId, 'Sacrament', 100) as string,
        clergyId: stringField(value.clergyId, 'Priest', 100) as string,
        venueId: stringField(value.venueId, 'Venue', 100) as string,
        startsAt: stringField(value.startsAt, 'Appointment time', 40) as string,
      };
    case 'queue.issue':
      return {
        action,
        parishId: stringField(value.parishId, 'Parish', 100) as string,
        parishionerName: stringField(value.parishionerName, 'Visitor name', 120) as string,
        service: stringField(value.service, 'Queue purpose', 80) as string,
      };
    case 'announcement.publish': {
      const audience = stringField(value.audience, 'Audience', 20);
      if (audience !== 'all' && audience !== 'parish') throw new AdminServiceError('Unknown announcement audience.');
      return {
        action,
        title: stringField(value.title, 'Title', 120) as string,
        body: stringField(value.body, 'Announcement', 2000) as string,
        audience,
        parishId: stringField(value.parishId, 'Parish', 100, false),
      };
    }
    case 'record.create':
      return {
        action,
        parishId: stringField(value.parishId, 'Parish', 100) as string,
        recordType: stringField(value.recordType, 'Record type', 60) as string,
        subjectName: stringField(value.subjectName, 'Subject name', 160) as string,
        eventDate: stringField(value.eventDate, 'Event date', 10) as string,
        reference: stringField(value.reference, 'Archive reference', 50) as string,
      };
    case 'record.verify':
      return { action, recordId: stringField(value.recordId, 'Record', 100) as string };
    case 'clergy.assignment.create':
      return {
        action,
        parishId: stringField(value.parishId, 'Parish', 100) as string,
        clergyId: stringField(value.clergyId, 'Clergy', 100) as string,
        venueId: stringField(value.venueId, 'Venue', 100) as string,
        service: stringField(value.service, 'Service', 100) as string,
        startsAt: stringField(value.startsAt, 'Start time', 40) as string,
        endsAt: stringField(value.endsAt, 'End time', 40) as string,
      };
    case 'clergy.assignment.cancel':
      return { action, assignmentId: stringField(value.assignmentId, 'Assignment', 100) as string };
    case 'user.provision': {
      const role = stringField(value.role, 'Role', 40);
      if (role !== 'parish_staff' && role !== 'clergy') throw new AdminServiceError('Choose parish staff or clergy access.');
      return {
        action,
        fullName: stringField(value.fullName, 'Complete name', 120) as string,
        email: stringField(value.email, 'Email', 254) as string,
        role,
        parishId: stringField(value.parishId, 'Parish', 100) as string,
      };
    }
    case 'user.set_active':
      if (typeof value.isActive !== 'boolean') throw new AdminServiceError('Access state must be active or inactive.');
      return { action, userId: stringField(value.userId, 'User', 100) as string, isActive: value.isActive };
    case 'change_request.decide': {
      const decision = stringField(value.decision, 'Decision', 20);
      if (decision !== 'approve' && decision !== 'reject') throw new AdminServiceError('Choose approve or reject.');
      return {
        action,
        requestId: stringField(value.requestId, 'Request', 100) as string,
        decision,
        note: stringField(value.note, 'Decision note', 500, false),
      };
    }
    case 'venue.create': {
      const capacity = value.capacity === undefined || value.capacity === null || value.capacity === '' ? undefined : Number(value.capacity);
      if (capacity !== undefined && !Number.isInteger(capacity)) throw new AdminServiceError('Venue capacity must be a whole number.');
      return {
        action,
        parishId: stringField(value.parishId, 'Parish', 100) as string,
        name: stringField(value.name, 'Venue name', 100) as string,
        ...(capacity === undefined ? {} : { capacity }),
      };
    }
    case 'parish.profile.update':
      return {
        action,
        parishId: stringField(value.parishId, 'Parish', 100) as string,
        address: stringField(value.address, 'Parish address', 240, false) ?? null,
        officeHours: stringField(value.officeHours, 'Office hours', 160, false) ?? null,
        contactPhone: stringField(value.contactPhone, 'Contact phone', 40, false) ?? null,
        contactEmail: stringField(value.contactEmail, 'Contact email', 254, false) ?? null,
        description: stringField(value.description, 'Parish description', 500, false) ?? null,
      };
    case 'service.update': {
      const durationMinutes = Number(value.durationMinutes);
      const bufferBeforeMinutes = Number(value.bufferBeforeMinutes);
      const bufferAfterMinutes = Number(value.bufferAfterMinutes);
      if (!Number.isInteger(durationMinutes) || !Number.isInteger(bufferBeforeMinutes) || !Number.isInteger(bufferAfterMinutes)) {
        throw new AdminServiceError('Duration and buffers must be whole numbers of minutes.');
      }
      if (typeof value.isActive !== 'boolean') {
        throw new AdminServiceError('Sacrament availability must be active or paused.');
      }
      return {
        action,
        serviceTypeId: stringField(value.serviceTypeId, 'Sacrament', 100) as string,
        durationMinutes,
        bufferBeforeMinutes,
        bufferAfterMinutes,
        description: stringField(value.description, 'Sacrament description', 500, false) ?? null,
        isActive: value.isActive,
      };
    }
    case 'requirement.create': {
      if (typeof value.isRequired !== 'boolean') {
        throw new AdminServiceError('Specify whether the requirement is mandatory or optional.');
      }
      const sortOrder =
        value.sortOrder === undefined || value.sortOrder === null || value.sortOrder === ''
          ? undefined
          : Number(value.sortOrder);
      if (sortOrder !== undefined && !Number.isInteger(sortOrder)) {
        throw new AdminServiceError('Requirement order must be a whole number.');
      }
      return {
        action,
        serviceTypeId: stringField(value.serviceTypeId, 'Sacrament', 100) as string,
        name: stringField(value.name, 'Requirement name', 120) as string,
        instructions: stringField(value.instructions, 'Requirement instructions', 500, false) ?? null,
        isRequired: value.isRequired,
        ...(sortOrder === undefined ? {} : { sortOrder }),
      };
    }
    case 'requirement.update': {
      if (typeof value.isRequired !== 'boolean') {
        throw new AdminServiceError('Specify whether the requirement is mandatory or optional.');
      }
      if (typeof value.isActive !== 'boolean') {
        throw new AdminServiceError('Requirement state must be active or inactive.');
      }
      const sortOrder = Number(value.sortOrder);
      if (!Number.isInteger(sortOrder)) {
        throw new AdminServiceError('Requirement order must be a whole number.');
      }
      return {
        action,
        requirementId: stringField(value.requirementId, 'Requirement', 100) as string,
        name: stringField(value.name, 'Requirement name', 120) as string,
        instructions: stringField(value.instructions, 'Requirement instructions', 500, false) ?? null,
        isRequired: value.isRequired,
        sortOrder,
        isActive: value.isActive,
      };
    }
    default:
      throw new AdminServiceError('Unknown administrative action.');
  }
}

async function actorForRequest() {
  const identity = await getStaffUser();
  if (!identity) throw new AdminServiceError('Sign in to continue.', 401);
  return { identity, actor: await resolveActor(identity) };
}

export async function GET(): Promise<Response> {
  try {
    const { actor } = await actorForRequest();
    return json(await loadDashboardState(actor));
  } catch (error) {
    if (error instanceof AdminServiceError) return json({ error: error.message }, error.status);
    const requestId = recordServerFailure('admin-state-read', error);
    return json({ error: 'The portal could not load its records. Please try again.', requestId }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const requestOrigin = request.headers.get('origin');
    if (!requestOrigin || requestOrigin !== new URL(request.url).origin) {
      throw new AdminServiceError('The request origin could not be verified.', 403);
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      throw new AdminServiceError('Send administrative actions as JSON.', 415);
    }
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 12_000) throw new AdminServiceError('The request is too large.', 413);
    const { actor } = await actorForRequest();
    const idempotencyKey = validIdempotencyKey(request.headers.get('idempotency-key'));
    if (!idempotencyKey) {
      throw new AdminServiceError('A valid Idempotency-Key header is required for administrative actions.');
    }
    const mutation = parseMutation(await readSmallJson(request, 12_000));
    await performAdminMutation(actor, mutation, idempotencyKey);
    schedulePushDispatch();
    return json({ ok: true });
  } catch (error) {
    if (error instanceof AdminServiceError) return json({ error: error.message }, error.status);
    if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    const requestId = recordServerFailure('admin-state-write', error);
    return json({ error: 'The action could not be completed. Please try again.', requestId }, 500);
  }
}
