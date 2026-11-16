-- Audit history is append-only at the database layer. The application only
-- inserts audit entries and appointment history events; these triggers make
-- editing or removing them impossible even for direct database writes.
CREATE TRIGGER `trg_audit_logs_no_update` BEFORE UPDATE ON `audit_logs`
BEGIN SELECT RAISE(ABORT, 'audit log entries cannot be changed'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_audit_logs_no_delete` BEFORE DELETE ON `audit_logs`
BEGIN SELECT RAISE(ABORT, 'audit log entries cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_appointment_events_no_update` BEFORE UPDATE ON `appointment_events`
BEGIN SELECT RAISE(ABORT, 'appointment history cannot be changed'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_appointment_events_no_delete` BEFORE DELETE ON `appointment_events`
BEGIN SELECT RAISE(ABORT, 'appointment history cannot be deleted'); END;
