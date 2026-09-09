PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `parishes` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `timezone` text DEFAULT 'Asia/Manila' NOT NULL,
  `address` text,
  `office_hours` text,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_parishes_slug` ON `parishes` (`slug`);
--> statement-breakpoint
CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `external_auth_id` text,
  `email` text NOT NULL,
  `full_name` text NOT NULL,
  `role` text NOT NULL,
  `home_parish_id` text REFERENCES `parishes`(`id`),
  `phone` text,
  `locale` text DEFAULT 'en-PH' NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `last_login_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_external_auth` ON `users` (`external_auth_id`);
--> statement-breakpoint
CREATE INDEX `idx_users_home_parish_role` ON `users` (`home_parish_id`,`role`);
--> statement-breakpoint
CREATE TABLE `mobile_credentials` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  `password_hash` text NOT NULL,
  `password_salt` text NOT NULL,
  `password_iterations` integer DEFAULT 210000 NOT NULL,
  `failed_attempts` integer DEFAULT 0 NOT NULL,
  `locked_until` text,
  `notifications_enabled` integer DEFAULT 1 NOT NULL,
  `password_changed_at` text DEFAULT (datetime('now')) NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mobile_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `revoked_at` text,
  `last_seen_at` text DEFAULT (datetime('now')) NOT NULL,
  `user_agent_hash` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mobile_sessions_token` ON `mobile_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_mobile_sessions_user_expiry` ON `mobile_sessions` (`user_id`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `user_parish_memberships` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `parish_id` text NOT NULL REFERENCES `parishes`(`id`),
  `permission_scope` text DEFAULT 'own_parish' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_parish_membership` ON `user_parish_memberships` (`user_id`,`parish_id`);
--> statement-breakpoint
CREATE TABLE `service_types` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `duration_minutes` integer NOT NULL,
  `buffer_before_minutes` integer DEFAULT 0 NOT NULL,
  `buffer_after_minutes` integer DEFAULT 0 NOT NULL,
  `description` text,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_service_types_slug` ON `service_types` (`slug`);
--> statement-breakpoint
CREATE TABLE `clergy_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `display_title` text NOT NULL,
  `home_parish_id` text REFERENCES `parishes`(`id`),
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_clergy_user` ON `clergy_profiles` (`user_id`);
--> statement-breakpoint
CREATE TABLE `venues` (
  `id` text PRIMARY KEY NOT NULL,
  `parish_id` text NOT NULL REFERENCES `parishes`(`id`),
  `name` text NOT NULL,
  `capacity` integer,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_venues_parish_name` ON `venues` (`parish_id`,`name`);
--> statement-breakpoint
CREATE TABLE `availability_blocks` (
  `id` text PRIMARY KEY NOT NULL,
  `parish_id` text NOT NULL REFERENCES `parishes`(`id`),
  `clergy_id` text REFERENCES `clergy_profiles`(`id`),
  `venue_id` text REFERENCES `venues`(`id`),
  `kind` text NOT NULL,
  `starts_at` text NOT NULL,
  `ends_at` text NOT NULL,
  `notes` text,
  `recurrence_rule` text,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_availability_clergy_time` ON `availability_blocks` (`clergy_id`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE INDEX `idx_availability_venue_time` ON `availability_blocks` (`venue_id`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE TABLE `document_requirements` (
  `id` text PRIMARY KEY NOT NULL,
  `service_type_id` text NOT NULL REFERENCES `service_types`(`id`),
  `name` text NOT NULL,
  `instructions` text,
  `is_required` integer DEFAULT 1 NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_document_requirements_service` ON `document_requirements` (`service_type_id`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `appointments` (
  `id` text PRIMARY KEY NOT NULL,
  `reference` text NOT NULL,
  `parishioner_user_id` text NOT NULL REFERENCES `users`(`id`),
  `parishioner_name` text NOT NULL,
  `service_type_id` text NOT NULL REFERENCES `service_types`(`id`),
  `parish_id` text NOT NULL REFERENCES `parishes`(`id`),
  `clergy_id` text REFERENCES `clergy_profiles`(`id`),
  `clergy_name` text,
  `venue_id` text REFERENCES `venues`(`id`),
  `venue_name` text,
  `starts_at` text NOT NULL,
  `ends_at` text NOT NULL,
  `status` text DEFAULT 'submitted' NOT NULL,
  `hold_expires_at` text,
  `review_note` text,
  `decision_reason` text,
  `decided_by` text REFERENCES `users`(`id`),
  `decided_at` text,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_appointments_reference` ON `appointments` (`reference`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_parish_status_start` ON `appointments` (`parish_id`,`status`,`starts_at`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_clergy_window` ON `appointments` (`clergy_id`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_venue_window` ON `appointments` (`venue_id`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_parishioner` ON `appointments` (`parishioner_user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `appointment_participants` (
  `id` text PRIMARY KEY NOT NULL,
  `appointment_id` text NOT NULL REFERENCES `appointments`(`id`),
  `participant_type` text NOT NULL,
  `full_name` text NOT NULL,
  `date_of_birth` text,
  `notes` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_appointment_participants_appointment` ON `appointment_participants` (`appointment_id`);
--> statement-breakpoint
CREATE TABLE `document_submissions` (
  `id` text PRIMARY KEY NOT NULL,
  `appointment_id` text NOT NULL REFERENCES `appointments`(`id`),
  `requirement_id` text REFERENCES `document_requirements`(`id`),
  `requirement_name` text NOT NULL,
  `storage_key` text,
  `original_file_name` text,
  `mime_type` text,
  `size_bytes` integer,
  `sha256` text,
  `status` text DEFAULT 'not_submitted' NOT NULL,
  `reviewer_id` text REFERENCES `users`(`id`),
  `review_note` text,
  `reviewed_at` text,
  `submitted_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_submission_requirement` ON `document_submissions` (`appointment_id`,`requirement_name`);
--> statement-breakpoint
CREATE INDEX `idx_document_submissions_status` ON `document_submissions` (`status`,`submitted_at`);
--> statement-breakpoint
CREATE TABLE `appointment_events` (
  `id` text PRIMARY KEY NOT NULL,
  `appointment_id` text NOT NULL REFERENCES `appointments`(`id`),
  `actor_id` text REFERENCES `users`(`id`),
  `event_type` text NOT NULL,
  `from_status` text,
  `to_status` text,
  `detail` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_appointment_events_appointment` ON `appointment_events` (`appointment_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `queue_tickets` (
  `id` text PRIMARY KEY NOT NULL,
  `ticket_number` text NOT NULL,
  `parish_id` text NOT NULL REFERENCES `parishes`(`id`),
  `parishioner_user_id` text REFERENCES `users`(`id`),
  `parishioner_name` text NOT NULL,
  `service` text NOT NULL,
  `status` text DEFAULT 'waiting' NOT NULL,
  `priority` integer DEFAULT 0 NOT NULL,
  `counter` text,
  `issued_at` text DEFAULT (datetime('now')) NOT NULL,
  `called_at` text,
  `served_at` text,
  `cancelled_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_queue_ticket_parish_number` ON `queue_tickets` (`parish_id`,`ticket_number`);
--> statement-breakpoint
CREATE INDEX `idx_queue_parish_status_priority` ON `queue_tickets` (`parish_id`,`status`,`priority`,`issued_at`);
--> statement-breakpoint
CREATE TABLE `notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `recipient_user_id` text NOT NULL REFERENCES `users`(`id`),
  `type` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `entity_type` text,
  `entity_id` text,
  `push_provider_id` text,
  `delivered_at` text,
  `read_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_read` ON `notifications` (`recipient_user_id`,`read_at`,`created_at`);
--> statement-breakpoint
CREATE TABLE `announcements` (
  `id` text PRIMARY KEY NOT NULL,
  `author_id` text NOT NULL REFERENCES `users`(`id`),
  `parish_id` text REFERENCES `parishes`(`id`),
  `audience` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `publish_at` text,
  `published_at` text,
  `expires_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_announcements_scope_publish` ON `announcements` (`parish_id`,`status`,`publish_at`);
--> statement-breakpoint
CREATE TABLE `sacramental_records` (
  `id` text PRIMARY KEY NOT NULL,
  `parish_id` text NOT NULL REFERENCES `parishes`(`id`),
  `record_type` text NOT NULL,
  `subject_name` text NOT NULL,
  `event_date` text NOT NULL,
  `reference` text NOT NULL,
  `book_number` text,
  `page_number` text,
  `entry_number` text,
  `officiant` text,
  `certificate_number` text,
  `status` text DEFAULT 'working_copy' NOT NULL,
  `verified_against_archive_at` text,
  `verified_by` text REFERENCES `users`(`id`),
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sacramental_records_reference` ON `sacramental_records` (`reference`);
--> statement-breakpoint
CREATE INDEX `idx_sacramental_records_parish_type_subject` ON `sacramental_records` (`parish_id`,`record_type`,`subject_name`);
--> statement-breakpoint
CREATE TABLE `clergy_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `clergy_id` text NOT NULL REFERENCES `clergy_profiles`(`id`),
  `clergy_name` text NOT NULL,
  `parish_id` text NOT NULL REFERENCES `parishes`(`id`),
  `venue_id` text REFERENCES `venues`(`id`),
  `venue_name` text NOT NULL,
  `service` text NOT NULL,
  `starts_at` text NOT NULL,
  `ends_at` text NOT NULL,
  `status` text DEFAULT 'confirmed' NOT NULL,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_clergy_assignments_clergy_window` ON `clergy_assignments` (`clergy_id`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE INDEX `idx_clergy_assignments_parish_window` ON `clergy_assignments` (`parish_id`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE TABLE `chatbot_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text REFERENCES `users`(`id`),
  `session_id` text NOT NULL,
  `direction` text NOT NULL,
  `category` text,
  `redacted_content` text,
  `provider_request_id` text,
  `escalated` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chatbot_messages_session` ON `chatbot_messages` (`session_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `evaluation_responses` (
  `id` text PRIMARY KEY NOT NULL,
  `respondent_group` text NOT NULL,
  `quality_characteristic` text NOT NULL,
  `item_code` text NOT NULL,
  `score` integer NOT NULL,
  `consent_recorded` integer NOT NULL,
  `submitted_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_evaluation_characteristic` ON `evaluation_responses` (`quality_characteristic`,`submitted_at`);
--> statement-breakpoint
CREATE TABLE `mobile_rate_limits` (
  `id` text PRIMARY KEY NOT NULL,
  `scope` text NOT NULL,
  `subject_hash` text NOT NULL,
  `window_start` integer NOT NULL,
  `request_count` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mobile_rate_limits_bucket` ON `mobile_rate_limits` (`scope`,`subject_hash`,`window_start`);
--> statement-breakpoint
CREATE INDEX `idx_mobile_rate_limits_created` ON `mobile_rate_limits` (`created_at`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text REFERENCES `users`(`id`),
  `action` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text,
  `parish_id` text REFERENCES `parishes`(`id`),
  `outcome` text NOT NULL,
  `detail` text,
  `request_id` text,
  `ip_hash` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity_type`,`entity_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_audit_actor` ON `audit_logs` (`actor_id`,`created_at`);
