// Keep this local-development bootstrap in step with 0004_push_notifications.sql.
// Production only validates migrations; it never runs this bootstrap.
export const PUSH_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS push_devices (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES mobile_sessions(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL, project_id TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS push_devices_expo_push_token_unique ON push_devices(expo_push_token)`,
  `CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id, enabled)`,
  `CREATE TABLE IF NOT EXISTS push_deliveries (
    id TEXT PRIMARY KEY,
    notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES mobile_sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','sending','ticketed','delivered','failed','cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0, receipt_checks INTEGER NOT NULL DEFAULT 0,
    available_at INTEGER NOT NULL DEFAULT (unixepoch()), lease_until INTEGER,
    claim_id TEXT, ticket_id TEXT, last_error_code TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), completed_at INTEGER
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_push_delivery_notification_device ON push_deliveries(notification_id, device_id)`,
  `CREATE INDEX IF NOT EXISTS idx_push_deliveries_due ON push_deliveries(status, available_at, lease_until)`,
  `CREATE TRIGGER IF NOT EXISTS notifications_enqueue_push
    AFTER INSERT ON notifications BEGIN
      INSERT INTO push_deliveries (id, notification_id, device_id, user_id, session_id)
      SELECT NEW.id || ':' || d.id, NEW.id, d.id, d.user_id, d.session_id
      FROM push_devices d
      JOIN users u ON u.id = d.user_id
      JOIN mobile_sessions s ON s.id = d.session_id AND s.user_id = d.user_id
      JOIN mobile_credentials c ON c.user_id = d.user_id
      WHERE d.user_id = NEW.recipient_user_id AND d.enabled = 1 AND u.is_active = 1
        AND c.notifications_enabled = 1 AND s.revoked_at IS NULL
        AND datetime(s.expires_at) > datetime('now');
    END`,
] as const;
