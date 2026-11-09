-- Numeric instants keep differently offset timestamps in chronological order.
CREATE INDEX IF NOT EXISTS idx_assignments_parish_page
  ON clergy_assignments(parish_id, status, julianday(starts_at), id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_assignments_clergy_page
  ON clergy_assignments(clergy_id, status, julianday(starts_at), id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_assignments_all_page
  ON clergy_assignments(status, julianday(starts_at), id);
