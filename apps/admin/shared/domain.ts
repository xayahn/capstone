export const USER_ROLES = ['parishioner', 'parish_staff', 'clergy', 'system_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const INTERNAL_USER_ROLES = ['parish_staff', 'clergy', 'system_admin'] as const;
export type InternalUserRole = (typeof INTERNAL_USER_ROLES)[number];

export const APPOINTMENT_STATUSES = [
  'submitted',
  'documents_pending',
  'under_review',
  'needs_changes',
  'ready_to_approve',
  'approved',
  'rejected',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const DOCUMENT_STATUSES = [
  'not_submitted',
  'submitted',
  'under_review',
  'verified',
  'needs_replacement',
  'not_required',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: InternalUserRole;
  parishId: string | null;
  parishName: string;
  clergyProfileId: string | null;
};

export type Appointment = {
  id: string;
  reference: string;
  parishioner: string;
  service: string;
  parishId: string;
  parish: string;
  clergy: string;
  venue: string;
  participants: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  verifiedDocuments: number;
  requiredDocuments: number;
  reviewNote: string | null;
  conflict: boolean;
  version: number;
};

export type AppointmentDocument = {
  id: string;
  requirementId: string;
  appointmentId: string;
  reference: string;
  parishioner: string;
  service: string;
  requirement: string;
  fileName: string | null;
  status: DocumentStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  sha256: string | null;
};

export type QueueTicket = {
  id: string;
  number: string;
  parishId: string;
  parish: string;
  service: string;
  parishioner: string;
  status: 'waiting' | 'serving' | 'served' | 'cancelled' | 'no_show';
  priority: number;
  issuedAt: string;
  calledAt: string | null;
  counter: string | null;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  parish: string;
  publishedAt: string;
  author: string;
};

export type ParishRecord = {
  id: string;
  type: string;
  subject: string;
  parish: string;
  eventDate: string;
  reference: string;
  status: 'working_copy' | 'verified_against_archive';
};

export type ParishRecordCursor = { eventDate: string; id: string };
export type ParishRecordPage = { records: ParishRecord[]; nextCursor: ParishRecordCursor | null };

export type ClergyAssignment = {
  id: string;
  clergy: string;
  parish: string;
  venue: string;
  service: string;
  startsAt: string;
  endsAt: string;
};

export type AssignmentCursor = { startsAt: string; id: string };
export type AssignmentPage = { assignments: ClergyAssignment[]; nextCursor: AssignmentCursor | null };

/** A parishioner's reschedule or cancellation request (migration 0007). */
export type ChangeRequest = {
  id: string;
  appointmentId: string;
  reference: string;
  parishioner: string;
  service: string;
  parishId: string;
  parish: string;
  clergy: string;
  venue: string;
  kind: 'reschedule' | 'cancel';
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  appointmentStatus: AppointmentStatus;
  currentStartsAt: string;
  proposedStartsAt: string | null;
  proposedEndsAt: string | null;
  reason: string;
  decisionNote: string | null;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** Whether the signed-in person may decide this request (staff of the parish or the assigned priest). */
  canDecide: boolean;
  /** For pending reschedules: whether the proposed time is still free right now. */
  proposedSlotAvailable: boolean | null;
};

export type DashboardMetrics = {
  appointmentStatuses: Partial<Record<AppointmentStatus, number>>;
  awaitingDocumentReview: number | null;
  verifiedDocuments: number | null;
  verifiedRecords: number | null;
  confirmedAssignments: number;
  publishedAnnouncements: number;
  waitingQueue: number | null;
  servingQueue: number | null;
};

export type ParishProfile = {
  id: string;
  name: string;
  address: string | null;
  officeHours: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  description: string | null;
};

export type RequirementSetting = {
  id: string;
  serviceTypeId: string;
  name: string;
  instructions: string | null;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type ServiceSetting = {
  id: string;
  slug: string;
  name: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  description: string | null;
  isActive: boolean;
  requirements: RequirementSetting[];
};

export type ReportFilters = {
  parishId: string | null;
  serviceTypeId: string | null;
  status: AppointmentStatus | 'all';
  from: string | null;
  to: string | null;
};

export type ReportBreakdownRow = {
  key: string;
  label: string;
  total: number;
  approvedOrCompleted: number;
  pending: number;
  closed: number;
};

export type ReportAppointmentRow = {
  id: string;
  reference: string;
  parishioner: string;
  service: string;
  parish: string;
  clergy: string;
  venue: string;
  startsAt: string;
  status: AppointmentStatus;
  verifiedDocuments: number;
  requiredDocuments: number;
};

export type AdminReport = {
  filters: ReportFilters;
  scopeLabel: string;
  generatedAt: string;
  totals: {
    appointments: number;
    approved: number;
    completed: number;
    pending: number;
    cancelledOrRejected: number;
    noShow: number;
    awaitingDocumentReview: number | null;
    verifiedDocuments: number | null;
    avgDocumentReviewHours: number | null;
    verifiedRecords: number | null;
    queueServed: number | null;
    avgQueueWaitMinutes: number | null;
  };
  byStatus: { status: AppointmentStatus; count: number }[];
  byService: ReportBreakdownRow[];
  byParish: ReportBreakdownRow[];
  byMonth: { month: string; total: number; completed: number; approved: number }[];
  appointments: ReportAppointmentRow[];
  appointmentsTruncated: boolean;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  parishId: string | null;
  parish: string;
  actorName: string;
  actorRole: string | null;
  outcome: 'success' | 'denied';
  detail: string | null;
  createdAt: string;
};

export type AuditLogCursor = { createdAt: string; id: string };
export type AuditLogPage = {
  entries: AuditLogEntry[];
  nextCursor: AuditLogCursor | null;
};

export type DashboardState = {
  metrics: DashboardMetrics;
  actor: Actor;
  parishes: { id: string; name: string }[];
  parishProfiles: ParishProfile[];
  serviceSettings: ServiceSetting[];
  clergyOptions: { id: string; name: string; parishId: string | null }[];
  venueOptions: { id: string; name: string; parishId: string; capacity?: number | null }[];
  accessUsers: { id: string; name: string; email: string; role: UserRole; parish: string; isActive: boolean }[];
  appointments: Appointment[];
  documents: AppointmentDocument[];
  queue: QueueTicket[];
  announcements: Announcement[];
  records: ParishRecord[];
  clergyAssignments: ClergyAssignment[];
  changeRequests: ChangeRequest[];
  generatedAt: string;
  source: 'd1' | 'demo';
};

export type AdminMutation =
  | { action: 'appointment.transition'; appointmentId: string; status: AppointmentStatus; expectedVersion: number; reason?: string }
  | { action: 'document.review'; documentId: string; expectedSha256: string; status: 'verified' | 'needs_replacement'; note?: string }
  | { action: 'queue.call_next'; counter: string; parishId: string }
  | { action: 'queue.complete'; ticketId: string }
  | { action: 'queue.cancel'; ticketId: string; status: 'cancelled' | 'no_show' }
  | {
      action: 'walkin.appointment.create';
      parishId: string;
      ticketId?: string | null;
      parishionerName: string;
      contactPhone?: string | null;
      participantName?: string | null;
      serviceTypeId: string;
      clergyId: string;
      venueId: string;
      startsAt: string;
    }
  | { action: 'queue.issue'; parishId: string; parishionerName: string; service: string }
  | { action: 'announcement.publish'; title: string; body: string; audience: 'all' | 'parish'; parishId?: string }
  | { action: 'record.create'; parishId: string; recordType: string; subjectName: string; eventDate: string; reference: string }
  | { action: 'record.verify'; recordId: string }
  | { action: 'clergy.assignment.create'; parishId: string; clergyId: string; venueId: string; service: string; startsAt: string; endsAt: string }
  | { action: 'clergy.assignment.cancel'; assignmentId: string }
  | { action: 'user.provision'; fullName: string; email: string; role: 'parish_staff' | 'clergy'; parishId: string }
  | { action: 'user.set_active'; userId: string; isActive: boolean }
  | { action: 'venue.create'; parishId: string; name: string; capacity?: number }
  | { action: 'change_request.decide'; requestId: string; decision: 'approve' | 'reject'; note?: string }
  | {
      action: 'parish.profile.update';
      parishId: string;
      address: string | null;
      officeHours: string | null;
      contactPhone: string | null;
      contactEmail: string | null;
      description: string | null;
    }
  | {
      action: 'service.update';
      serviceTypeId: string;
      durationMinutes: number;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
      description: string | null;
      isActive: boolean;
    }
  | {
      action: 'requirement.create';
      serviceTypeId: string;
      name: string;
      instructions: string | null;
      isRequired: boolean;
      sortOrder?: number;
    }
  | {
      action: 'requirement.update';
      requirementId: string;
      name: string;
      instructions: string | null;
      isRequired: boolean;
      sortOrder: number;
      isActive: boolean;
    };

export function humanizeStatus(status: string): string {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
