import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AppointmentStatus, DocumentStatus, UserRole } from '@/shared/domain';

const createdAt = text('created_at').notNull().default(sql`(datetime('now'))`);
const updatedAt = text('updated_at').notNull().default(sql`(datetime('now'))`);

export const parishes = sqliteTable('parishes', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Asia/Manila'),
  address: text('address'),
  officeHours: text('office_hours'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex('idx_parishes_slug').on(table.slug)]);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  externalAuthId: text('external_auth_id'),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').$type<UserRole>().notNull(),
  homeParishId: text('home_parish_id').references(() => parishes.id),
  phone: text('phone'),
  locale: text('locale').notNull().default('en-PH'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastLoginAt: text('last_login_at'),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('idx_users_email').on(table.email),
  uniqueIndex('idx_users_external_auth').on(table.externalAuthId),
  index('idx_users_home_parish_role').on(table.homeParishId, table.role),
]);

export const mobileCredentials = sqliteTable('mobile_credentials', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  passwordIterations: integer('password_iterations').notNull().default(210000),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: text('locked_until'),
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).notNull().default(true),
  passwordChangedAt: text('password_changed_at').notNull().default(sql`(datetime('now'))`),
  createdAt,
  updatedAt,
});

export const mobileSessions = sqliteTable('mobile_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: text('expires_at').notNull(),
  revokedAt: text('revoked_at'),
  lastSeenAt: text('last_seen_at').notNull().default(sql`(datetime('now'))`),
  userAgentHash: text('user_agent_hash'),
  createdAt,
}, (table) => [
  uniqueIndex('idx_mobile_sessions_token').on(table.tokenHash),
  index('idx_mobile_sessions_user_expiry').on(table.userId, table.expiresAt),
]);

export const userParishMemberships = sqliteTable('user_parish_memberships', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  parishId: text('parish_id').notNull().references(() => parishes.id),
  permissionScope: text('permission_scope').notNull().default('own_parish'),
  createdAt,
}, (table) => [uniqueIndex('idx_user_parish_membership').on(table.userId, table.parishId)]);

export const serviceTypes = sqliteTable('service_types', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
  bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex('idx_service_types_slug').on(table.slug)]);

export const clergyProfiles = sqliteTable('clergy_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  displayTitle: text('display_title').notNull(),
  homeParishId: text('home_parish_id').references(() => parishes.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex('idx_clergy_user').on(table.userId)]);

export const venues = sqliteTable('venues', {
  id: text('id').primaryKey(),
  parishId: text('parish_id').notNull().references(() => parishes.id),
  name: text('name').notNull(),
  capacity: integer('capacity'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex('idx_venues_parish_name').on(table.parishId, table.name)]);

export const availabilityBlocks = sqliteTable('availability_blocks', {
  id: text('id').primaryKey(),
  parishId: text('parish_id').notNull().references(() => parishes.id),
  clergyId: text('clergy_id').references(() => clergyProfiles.id),
  venueId: text('venue_id').references(() => venues.id),
  kind: text('kind').notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  notes: text('notes'),
  recurrenceRule: text('recurrence_rule'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt,
  updatedAt,
}, (table) => [
  index('idx_availability_clergy_time').on(table.clergyId, table.startsAt, table.endsAt),
  index('idx_availability_venue_time').on(table.venueId, table.startsAt, table.endsAt),
]);

export const documentRequirements = sqliteTable('document_requirements', {
  id: text('id').primaryKey(),
  serviceTypeId: text('service_type_id').notNull().references(() => serviceTypes.id),
  name: text('name').notNull(),
  instructions: text('instructions'),
  isRequired: integer('is_required', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => [index('idx_document_requirements_service').on(table.serviceTypeId, table.sortOrder)]);

export const appointments = sqliteTable('appointments', {
  id: text('id').primaryKey(),
  reference: text('reference').notNull(),
  parishionerUserId: text('parishioner_user_id').notNull().references(() => users.id),
  parishionerName: text('parishioner_name').notNull(),
  serviceTypeId: text('service_type_id').notNull().references(() => serviceTypes.id),
  checklistVersionId: text('checklist_version_id').notNull().default('legacy'),
  parishId: text('parish_id').notNull().references(() => parishes.id),
  clergyId: text('clergy_id').references(() => clergyProfiles.id),
  clergyName: text('clergy_name'),
  venueId: text('venue_id').references(() => venues.id),
  venueName: text('venue_name'),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  status: text('status').$type<AppointmentStatus>().notNull().default('submitted'),
  holdExpiresAt: text('hold_expires_at'),
  reviewNote: text('review_note'),
  decisionReason: text('decision_reason'),
  decidedBy: text('decided_by').references(() => users.id),
  decidedAt: text('decided_at'),
  version: integer('version').notNull().default(1),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('idx_appointments_reference').on(table.reference),
  index('idx_appointments_parish_status_start').on(table.parishId, table.status, table.startsAt),
  index('idx_appointments_clergy_window').on(table.clergyId, table.startsAt, table.endsAt),
  index('idx_appointments_venue_window').on(table.venueId, table.startsAt, table.endsAt),
  index('idx_appointments_parishioner').on(table.parishionerUserId, table.createdAt),
]);

export const appointmentParticipants = sqliteTable('appointment_participants', {
  id: text('id').primaryKey(),
  appointmentId: text('appointment_id').notNull().references(() => appointments.id),
  participantType: text('participant_type').notNull(),
  fullName: text('full_name').notNull(),
  dateOfBirth: text('date_of_birth'),
  notes: text('notes'),
  createdAt,
  updatedAt,
}, (table) => [index('idx_appointment_participants_appointment').on(table.appointmentId)]);

export const documentSubmissions = sqliteTable('document_submissions', {
  id: text('id').primaryKey(),
  appointmentId: text('appointment_id').notNull().references(() => appointments.id),
  requirementId: text('requirement_id').references(() => documentRequirements.id),
  requirementName: text('requirement_name').notNull(),
  requirementInstructions: text('requirement_instructions'),
  isRequired: integer('is_required', { mode: 'boolean' }).notNull().default(true),
  checklistVersionId: text('checklist_version_id').notNull().default('legacy'),
  storageKey: text('storage_key'),
  originalFileName: text('original_file_name'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  sha256: text('sha256'),
  status: text('status').$type<DocumentStatus>().notNull().default('not_submitted'),
  reviewerId: text('reviewer_id').references(() => users.id),
  reviewNote: text('review_note'),
  reviewedAt: text('reviewed_at'),
  submittedAt: text('submitted_at'),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('idx_document_submission_requirement').on(table.appointmentId, table.requirementName),
  index('idx_document_submissions_status').on(table.status, table.submittedAt),
]);

export const appointmentEvents = sqliteTable('appointment_events', {
  id: text('id').primaryKey(),
  appointmentId: text('appointment_id').notNull().references(() => appointments.id),
  actorId: text('actor_id').references(() => users.id),
  eventType: text('event_type').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  detail: text('detail'),
  createdAt,
}, (table) => [index('idx_appointment_events_appointment').on(table.appointmentId, table.createdAt)]);

export const queueTickets = sqliteTable('queue_tickets', {
  id: text('id').primaryKey(),
  ticketNumber: text('ticket_number').notNull(),
  parishId: text('parish_id').notNull().references(() => parishes.id),
  parishionerUserId: text('parishioner_user_id').references(() => users.id),
  parishionerName: text('parishioner_name').notNull(),
  service: text('service').notNull(),
  status: text('status').notNull().default('waiting'),
  priority: integer('priority').notNull().default(0),
  counter: text('counter'),
  issuedAt: text('issued_at').notNull().default(sql`(datetime('now'))`),
  calledAt: text('called_at'),
  servedAt: text('served_at'),
  cancelledAt: text('cancelled_at'),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('idx_queue_ticket_parish_number').on(table.parishId, table.ticketNumber),
  index('idx_queue_parish_status_priority').on(table.parishId, table.status, table.priority, table.issuedAt),
]);

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  recipientUserId: text('recipient_user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  pushProviderId: text('push_provider_id'),
  deliveredAt: text('delivered_at'),
  readAt: text('read_at'),
  createdAt,
}, (table) => [index('idx_notifications_recipient_read').on(table.recipientUserId, table.readAt, table.createdAt)]);

export const announcements = sqliteTable('announcements', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull().references(() => users.id),
  parishId: text('parish_id').references(() => parishes.id),
  audience: text('audience').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('draft'),
  publishAt: text('publish_at'),
  publishedAt: text('published_at'),
  expiresAt: text('expires_at'),
  createdAt,
  updatedAt,
}, (table) => [index('idx_announcements_scope_publish').on(table.parishId, table.status, table.publishAt)]);

export const sacramentalRecords = sqliteTable('sacramental_records', {
  id: text('id').primaryKey(),
  parishId: text('parish_id').notNull().references(() => parishes.id),
  recordType: text('record_type').notNull(),
  subjectName: text('subject_name').notNull(),
  eventDate: text('event_date').notNull(),
  reference: text('reference').notNull(),
  bookNumber: text('book_number'),
  pageNumber: text('page_number'),
  entryNumber: text('entry_number'),
  officiant: text('officiant'),
  certificateNumber: text('certificate_number'),
  status: text('status').notNull().default('working_copy'),
  verifiedAgainstArchiveAt: text('verified_against_archive_at'),
  verifiedBy: text('verified_by').references(() => users.id),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('idx_sacramental_records_reference').on(table.reference),
  index('idx_sacramental_records_parish_type_subject').on(table.parishId, table.recordType, table.subjectName),
]);

export const clergyAssignments = sqliteTable('clergy_assignments', {
  id: text('id').primaryKey(),
  clergyId: text('clergy_id').notNull().references(() => clergyProfiles.id),
  clergyName: text('clergy_name').notNull(),
  parishId: text('parish_id').notNull().references(() => parishes.id),
  venueId: text('venue_id').references(() => venues.id),
  venueName: text('venue_name').notNull(),
  service: text('service').notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  status: text('status').notNull().default('confirmed'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt,
  updatedAt,
}, (table) => [
  index('idx_clergy_assignments_clergy_window').on(table.clergyId, table.startsAt, table.endsAt),
  index('idx_clergy_assignments_parish_window').on(table.parishId, table.startsAt, table.endsAt),
]);

export const chatbotMessages = sqliteTable('chatbot_messages', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  sessionId: text('session_id').notNull(),
  direction: text('direction').notNull(),
  category: text('category'),
  redactedContent: text('redacted_content'),
  providerRequestId: text('provider_request_id'),
  escalated: integer('escalated', { mode: 'boolean' }).notNull().default(false),
  createdAt,
}, (table) => [index('idx_chatbot_messages_session').on(table.sessionId, table.createdAt)]);

export const evaluationResponses = sqliteTable('evaluation_responses', {
  id: text('id').primaryKey(),
  respondentGroup: text('respondent_group').notNull(),
  qualityCharacteristic: text('quality_characteristic').notNull(),
  itemCode: text('item_code').notNull(),
  score: integer('score').notNull(),
  consentRecorded: integer('consent_recorded', { mode: 'boolean' }).notNull(),
  submittedAt: text('submitted_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [index('idx_evaluation_characteristic').on(table.qualityCharacteristic, table.submittedAt)]);

export const mobileRateLimits = sqliteTable('mobile_rate_limits', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  subjectHash: text('subject_hash').notNull(),
  windowStart: integer('window_start').notNull(),
  requestCount: integer('request_count').notNull().default(1),
  createdAt,
}, (table) => [
  uniqueIndex('idx_mobile_rate_limits_bucket').on(table.scope, table.subjectHash, table.windowStart),
  index('idx_mobile_rate_limits_created').on(table.createdAt),
]);

export const idempotencyKeys = sqliteTable('idempotency_keys', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(),
  keyHash: text('key_hash').notNull(),
  requestHash: text('request_hash').notNull(),
  resourceId: text('resource_id'),
  responseStatus: integer('response_status').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt,
}, (table) => [
  uniqueIndex('idx_idempotency_actor_scope_key').on(table.actorId, table.scope, table.keyHash),
  index('idx_idempotency_expiry').on(table.expiresAt),
]);

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  parishId: text('parish_id').references(() => parishes.id),
  outcome: text('outcome').notNull(),
  detail: text('detail'),
  requestId: text('request_id'),
  ipHash: text('ip_hash'),
  createdAt,
}, (table) => [
  index('idx_audit_entity').on(table.entityType, table.entityId, table.createdAt),
  index('idx_audit_actor').on(table.actorId, table.createdAt),
]);
