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
};

export type QueueTicket = {
  id: string;
  number: string;
  parishId: string;
  parish: string;
  service: string;
  parishioner: string;
  status: 'waiting' | 'serving' | 'served' | 'cancelled';
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

export type ClergyAssignment = {
  id: string;
  clergy: string;
  parish: string;
  venue: string;
  service: string;
  startsAt: string;
  endsAt: string;
};

export type DashboardState = {
  actor: Actor;
  parishes: { id: string; name: string }[];
  clergyOptions: { id: string; name: string; parishId: string | null }[];
  venueOptions: { id: string; name: string; parishId: string }[];
  accessUsers: { id: string; name: string; email: string; role: UserRole; parish: string; isActive: boolean }[];
  appointments: Appointment[];
  documents: AppointmentDocument[];
  queue: QueueTicket[];
  announcements: Announcement[];
  records: ParishRecord[];
  clergyAssignments: ClergyAssignment[];
  generatedAt: string;
  source: 'd1' | 'demo';
};

export type AdminMutation =
  | { action: 'appointment.transition'; appointmentId: string; status: AppointmentStatus; expectedVersion: number; reason?: string }
  | { action: 'document.review'; documentId: string; status: 'verified' | 'needs_replacement'; note?: string }
  | { action: 'queue.call_next'; counter: string; parishId: string }
  | { action: 'queue.complete'; ticketId: string }
  | { action: 'queue.issue'; parishId: string; parishionerName: string; service: string }
  | { action: 'announcement.publish'; title: string; body: string; audience: 'all' | 'parish'; parishId?: string }
  | { action: 'record.create'; parishId: string; recordType: string; subjectName: string; eventDate: string; reference: string }
  | { action: 'record.verify'; recordId: string }
  | { action: 'clergy.assignment.create'; parishId: string; clergyId: string; venueId: string; service: string; startsAt: string; endsAt: string }
  | { action: 'clergy.assignment.cancel'; assignmentId: string }
  | { action: 'user.provision'; fullName: string; email: string; role: 'parish_staff' | 'clergy'; parishId: string }
  | { action: 'user.set_active'; userId: string; isActive: boolean }
  | { action: 'venue.create'; parishId: string; name: string; capacity?: number };

export function humanizeStatus(status: string): string {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
