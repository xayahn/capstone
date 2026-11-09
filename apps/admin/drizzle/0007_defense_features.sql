-- Defense feature set: parishioner change requests, reminder de-duplication,
-- booking-time buffer snapshots, parish contact details, audit browsing indexes,
-- and database-level integrity checks for controlled vocabularies.

-- 1. Reschedule and cancellation requests raised by parishioners and decided
--    by authorized parish personnel. A reschedule keeps the same priest and
--    venue; only the time changes.
CREATE TABLE `appointment_change_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL REFERENCES `appointments`(`id`) ON DELETE CASCADE,
	`kind` text NOT NULL CHECK (`kind` IN ('reschedule','cancel')),
	`requested_by` text NOT NULL REFERENCES `users`(`id`),
	`previous_starts_at` text,
	`previous_ends_at` text,
	`proposed_starts_at` text,
	`proposed_ends_at` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','approved','rejected','withdrawn')),
	`decided_by` text REFERENCES `users`(`id`),
	`decided_at` text,
	`decision_note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CHECK (`kind` = 'cancel' OR (`proposed_starts_at` IS NOT NULL AND `proposed_ends_at` IS NOT NULL))
);
--> statement-breakpoint
-- At most one open request per appointment.
CREATE UNIQUE INDEX `idx_change_requests_one_pending` ON `appointment_change_requests` (`appointment_id`) WHERE `status` = 'pending';
--> statement-breakpoint
CREATE INDEX `idx_change_requests_status_created` ON `appointment_change_requests` (`status`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_change_requests_appointment` ON `appointment_change_requests` (`appointment_id`, `created_at`);
--> statement-breakpoint

-- 2. Buffers are captured when an appointment is booked so that later changes
--    to a sacrament's settings never move existing bookings.
ALTER TABLE `appointments` ADD `buffer_before_minutes` integer;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `buffer_after_minutes` integer;
--> statement-breakpoint
UPDATE `appointments` SET
	`buffer_before_minutes` = COALESCE((SELECT `buffer_before_minutes` FROM `service_types` WHERE `service_types`.`id` = `appointments`.`service_type_id`), 0),
	`buffer_after_minutes` = COALESCE((SELECT `buffer_after_minutes` FROM `service_types` WHERE `service_types`.`id` = `appointments`.`service_type_id`), 0);
--> statement-breakpoint

-- 3. Reminder and other system notifications are created at most once.
ALTER TABLE `notifications` ADD `dedupe_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notifications_dedupe` ON `notifications` (`dedupe_key`) WHERE `dedupe_key` IS NOT NULL;
--> statement-breakpoint

-- 4. Public parish contact details shown to parishioners and the assistant.
ALTER TABLE `parishes` ADD `contact_phone` text;
--> statement-breakpoint
ALTER TABLE `parishes` ADD `contact_email` text;
--> statement-breakpoint
ALTER TABLE `parishes` ADD `description` text;
--> statement-breakpoint

-- 5. Audit log browsing by parish, date and action.
CREATE INDEX `idx_audit_parish_created` ON `audit_logs` (`parish_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_logs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_audit_action_created` ON `audit_logs` (`action`, `created_at`);
--> statement-breakpoint

-- 6. Database-level integrity for controlled vocabularies. The application
--    already validates these values; the triggers make invalid states
--    impossible even for direct database writes.
CREATE TRIGGER `trg_users_role_insert` BEFORE INSERT ON `users`
WHEN NEW.`role` NOT IN ('parishioner','parish_staff','clergy','system_admin')
BEGIN SELECT RAISE(ABORT, 'invalid user role'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_users_role_update` BEFORE UPDATE OF `role` ON `users`
WHEN NEW.`role` NOT IN ('parishioner','parish_staff','clergy','system_admin')
BEGIN SELECT RAISE(ABORT, 'invalid user role'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_appointments_status_insert` BEFORE INSERT ON `appointments`
WHEN NEW.`status` NOT IN ('submitted','documents_pending','under_review','needs_changes','ready_to_approve','approved','rejected','completed','cancelled','no_show')
BEGIN SELECT RAISE(ABORT, 'invalid appointment status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_appointments_status_update` BEFORE UPDATE OF `status` ON `appointments`
WHEN NEW.`status` NOT IN ('submitted','documents_pending','under_review','needs_changes','ready_to_approve','approved','rejected','completed','cancelled','no_show')
BEGIN SELECT RAISE(ABORT, 'invalid appointment status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_documents_status_insert` BEFORE INSERT ON `document_submissions`
WHEN NEW.`status` NOT IN ('not_submitted','submitted','under_review','verified','needs_replacement','not_required')
BEGIN SELECT RAISE(ABORT, 'invalid document status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_documents_status_update` BEFORE UPDATE OF `status` ON `document_submissions`
WHEN NEW.`status` NOT IN ('not_submitted','submitted','under_review','verified','needs_replacement','not_required')
BEGIN SELECT RAISE(ABORT, 'invalid document status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_queue_status_insert` BEFORE INSERT ON `queue_tickets`
WHEN NEW.`status` NOT IN ('waiting','serving','served','cancelled','no_show')
BEGIN SELECT RAISE(ABORT, 'invalid queue ticket status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_queue_status_update` BEFORE UPDATE OF `status` ON `queue_tickets`
WHEN NEW.`status` NOT IN ('waiting','serving','served','cancelled','no_show')
BEGIN SELECT RAISE(ABORT, 'invalid queue ticket status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_assignments_status_insert` BEFORE INSERT ON `clergy_assignments`
WHEN NEW.`status` NOT IN ('confirmed','cancelled')
BEGIN SELECT RAISE(ABORT, 'invalid clergy assignment status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_assignments_status_update` BEFORE UPDATE OF `status` ON `clergy_assignments`
WHEN NEW.`status` NOT IN ('confirmed','cancelled')
BEGIN SELECT RAISE(ABORT, 'invalid clergy assignment status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_announcements_status_insert` BEFORE INSERT ON `announcements`
WHEN NEW.`status` NOT IN ('draft','published','archived')
BEGIN SELECT RAISE(ABORT, 'invalid announcement status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_announcements_status_update` BEFORE UPDATE OF `status` ON `announcements`
WHEN NEW.`status` NOT IN ('draft','published','archived')
BEGIN SELECT RAISE(ABORT, 'invalid announcement status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_records_status_insert` BEFORE INSERT ON `sacramental_records`
WHEN NEW.`status` NOT IN ('working_copy','verified_against_archive')
BEGIN SELECT RAISE(ABORT, 'invalid sacramental record status'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_records_status_update` BEFORE UPDATE OF `status` ON `sacramental_records`
WHEN NEW.`status` NOT IN ('working_copy','verified_against_archive')
BEGIN SELECT RAISE(ABORT, 'invalid sacramental record status'); END;
