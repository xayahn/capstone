ALTER TABLE `appointments` ADD `checklist_version_id` text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE `document_submissions` ADD `requirement_instructions` text;
--> statement-breakpoint
ALTER TABLE `document_submissions` ADD `is_required` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `document_submissions` ADD `checklist_version_id` text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
UPDATE `document_submissions`
SET `requirement_instructions` = (
      SELECT `instructions` FROM `document_requirements`
      WHERE `document_requirements`.`id` = `document_submissions`.`requirement_id`
    ),
    `is_required` = COALESCE((
      SELECT `is_required` FROM `document_requirements`
      WHERE `document_requirements`.`id` = `document_submissions`.`requirement_id`
    ), 1);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`scope` text NOT NULL,
	`key_hash` text NOT NULL,
	`request_hash` text NOT NULL,
	`resource_id` text,
	`response_status` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_idempotency_actor_scope_key` ON `idempotency_keys` (`actor_id`,`scope`,`key_hash`);
--> statement-breakpoint
CREATE INDEX `idx_idempotency_expiry` ON `idempotency_keys` (`expires_at`);
