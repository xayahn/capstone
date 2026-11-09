/**
 * Internal (parish staff, clergy, system administrator) password sign-in.
 *
 * These statements mirror drizzle/0006_staff_auth.sql so the local development
 * runtime and the migration-validated production schema stay identical.
 * Staff credentials are deliberately separate from parishioner mobile
 * credentials: a parishioner password can never open the internal portal.
 */
export const STAFF_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS staff_credentials (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL DEFAULT 210000,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    password_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS staff_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    user_agent_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_staff_sessions_user_expiry ON staff_sessions(user_id, expires_at)`,
] as const;
