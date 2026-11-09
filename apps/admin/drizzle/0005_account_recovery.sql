CREATE TABLE `mobile_email_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`session_id` text,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`credential_version` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`delivery_status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `mobile_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "email_challenge_purpose" CHECK("mobile_email_challenges"."purpose" IN ('password_reset','email_verification'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mobile_email_challenges_user_purpose` ON `mobile_email_challenges` (`user_id`,`purpose`);--> statement-breakpoint
CREATE INDEX `idx_mobile_email_challenges_expiry` ON `mobile_email_challenges` (`expires_at`);--> statement-breakpoint
ALTER TABLE `mobile_credentials` ADD `auth_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mobile_credentials` ADD `email_verified_at` text;
--> statement-breakpoint
CREATE TRIGGER mobile_password_invalidate_challenges AFTER UPDATE OF password_hash ON mobile_credentials
WHEN OLD.password_hash <> NEW.password_hash BEGIN
  UPDATE mobile_credentials SET auth_version = OLD.auth_version + 1 WHERE user_id = NEW.user_id;
  DELETE FROM mobile_email_challenges WHERE user_id = NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER mobile_identity_invalidate_challenges AFTER UPDATE OF email,is_active ON users
WHEN OLD.email <> NEW.email OR NEW.is_active = 0 BEGIN
  DELETE FROM mobile_email_challenges WHERE user_id = NEW.id;
  UPDATE mobile_credentials SET email_verified_at = CASE WHEN OLD.email <> NEW.email THEN NULL ELSE email_verified_at END
    WHERE user_id = NEW.id;
END;
