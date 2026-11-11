export type ParishId =
  | 'metropolitan-cathedral'
  | 'san-guillermo'
  | 'sanctuario-san-jose'
  | 'sta-lucia'
  | 'sto-nino'
  | 'san-isidro-labrador'
  | 'st-joseph'
  | 'our-lady-of-lourdes';

export type SacramentId =
  | 'baptism'
  | 'wedding'
  | 'confirmation'
  | 'first_communion'
  | 'funeral';

export type AppointmentStatus =
  | 'submitted'
  | 'pending_verification'
  | 'needs_action'
  | 'approved'
  | 'scheduled'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type DocumentStatus =
  | 'missing'
  | 'selected'
  | 'submitted'
  | 'under_review'
  | 'verified'
  | 'needs_action'
  | 'not_required';

export interface ClergyMember {
  id: string;
  name: string;
}

/** Public contact details published by the parish (fields are null until entered by parish staff). */
export interface ParishContact {
  address: string | null;
  officeHours: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
}

export interface Parish {
  id: ParishId;
  name: string;
  clergy: ClergyMember[];
  venueId: string;
  contact?: ParishContact;
}

export interface SacramentService {
  id: SacramentId;
  name: string;
  shortDescription: string;
  durationMinutes: number;
  requirements: string[];
  requirementDetails?: { id: string; name: string; required: boolean; instructions: string | null }[];
  icon: 'droplet' | 'heart' | 'cross' | 'sun' | 'flame';
}

export interface AppCatalog {
  parishes: Parish[];
  services: SacramentService[];
  queueServices: QueueService[];
}

export interface AppointmentDocument {
  id: string;
  label: string;
  status: DocumentStatus;
  required: boolean;
  fileName?: string;
  fileUri?: string;
  mimeType?: string;
  sizeBytes?: number;
  note?: string;
  updatedAt?: string;
}

export interface AppointmentParticipant {
  type: string;
  fullName: string;
  dateOfBirth?: string;
  notes?: string;
}

export interface UploadAppointmentDocumentInput {
  fileUri: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
}

/**
 * Parishioner change policy decided by the server: cancel immediately before approval,
 * request cancellation after approval, and request a reschedule at least 24 hours ahead.
 */
export interface AllowedChanges {
  cancel: 'immediate' | 'request' | null;
  reschedule: boolean;
}

export interface PendingChange {
  kind: 'reschedule' | 'cancel';
  proposedDate?: string;
  proposedTime?: string;
  reason: string;
  requestedAt: string;
}

export interface ChangeDecision {
  kind: 'reschedule' | 'cancel';
  status: 'approved' | 'rejected';
  note?: string;
}

export interface RescheduleInput {
  date: string;
  time: string;
  reason: string;
}

export interface Appointment {
  id: string;
  reference: string;
  parishionerId: string;
  serviceId: SacramentId;
  parishId: ParishId;
  clergyId: string;
  venueId: string;
  date: string;
  time: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  status: AppointmentStatus;
  participants?: AppointmentParticipant[];
  documents: AppointmentDocument[];
  submittedAt: string;
  updatedAt: string;
  /** Precise parish workflow status (for example "ready_to_approve"). */
  workflowStatus?: string;
  pendingChange?: PendingChange | null;
  lastChangeDecision?: ChangeDecision | null;
  allowedChanges?: AllowedChanges;
}

export interface AppointmentDraft {
  serviceId: SacramentId;
  parishId?: ParishId;
  clergyId?: string;
  venueId?: string;
  date?: string;
  time?: string;
  documents: AppointmentDocument[];
}

export type NotificationTarget =
  | { kind: 'appointment'; appointmentId: string }
  | { kind: 'queue' }
  | { kind: 'assistant'; prompt?: string }
  | { kind: 'home' };

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
  target: NotificationTarget;
}

export interface ParishionerProfile {
  id: string;
  displayName: string;
  email: string;
  mobileNumber: string;
  homeParishId: ParishId;
  notificationsEnabled: boolean;
  emailVerified?: boolean;
}

export interface AuthSession {
  mode: 'demo' | 'api';
  accessToken?: string;
  profile: ParishionerProfile;
}

export type QueueService =
  | 'Baptism inquiry'
  | 'Wedding inquiry'
  | 'Document submission'
  | 'Certificate request'
  | 'General inquiry';

export interface QueueTicket {
  id: string;
  number: string;
  parishId: ParishId;
  service: QueueService;
  status: 'waiting' | 'called' | 'serving' | 'completed' | 'cancelled';
  ahead: number;
  estimatedWaitMinutes: number | null;
  issuedAt: string;
  lastUpdatedAt: string;
}

export interface AssistantMessage {
  id: string;
  from: 'user' | 'assistant';
  text: string;
  createdAt: string;
  title?: string;
  bullets?: string[];
  sources?: AssistantSource[];
  actions?: AssistantAction[];
  followUpPrompts?: string[];
  clarification?: AssistantClarification;
  escalation?: boolean;
  provider?: 'gemini' | 'parishlink';
  fallbackReason?: 'disabled' | 'consent_required' | 'private_or_sensitive' | 'unavailable' | 'invalid_response' | 'out_of_scope';
}

export interface AssistantSource {
  label: string;
  kind: 'service_requirements' | 'appointment' | 'queue' | 'parish_directory';
  updatedAt?: string;
}

export interface AssistantAction {
  id: string;
  label: string;
  kind: 'service' | 'appointment' | 'documents' | 'queue' | 'home' | 'contact_parish';
  serviceId?: SacramentId;
  appointmentId?: string;
}

export interface AssistantClarification {
  question: string;
  options: Array<{
    id: string;
    label: string;
    prompt: string;
    serviceId?: SacramentId;
  }>;
}

export interface ParishAnnouncement {
  id: string;
  title: string;
  body: string;
  scope: 'parish' | 'vicariate';
  parishName: string;
  publishedAt: string;
}

export interface RepositorySnapshot {
  source: 'api' | 'demo';
  profile: ParishionerProfile;
  appointments: Appointment[];
  notifications: AppNotification[];
  announcements?: ParishAnnouncement[];
  activeQueueTicket?: QueueTicket;
}

export interface AvailabilitySearchInput {
  serviceId: SacramentId;
  parishId: ParishId;
  clergyId: string;
  venueId: string;
  date: string;
  /** When rescheduling, the appointment's own slot does not count as a conflict. */
  excludeAppointmentId?: string;
}

export interface AvailabilitySlot {
  time: string;
  available: boolean;
}

export interface CreateAppointmentInput {
  serviceId: SacramentId;
  parishId: ParishId;
  clergyId: string;
  venueId: string;
  date: string;
  time: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  participants?: AppointmentParticipant[];
  documents: AppointmentDocument[];
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput extends SignInInput {
  displayName: string;
  mobileNumber: string;
  homeParishId: ParishId;
  confirmPassword: string;
  acceptPrivacyNotice: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface PasswordResetInput {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
}
