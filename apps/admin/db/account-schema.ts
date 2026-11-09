/** Development initialization only; production uses append-only migrations. */
export const ACCOUNT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS mobile_email_challenges (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK(purpose IN ('password_reset','email_verification')),
    session_id TEXT REFERENCES mobile_sessions(id) ON DELETE CASCADE,
    email TEXT NOT NULL, code_hash TEXT NOT NULL, credential_version INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, delivery_status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL, consumed_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_email_challenges_user_purpose ON mobile_email_challenges(user_id,purpose)`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_email_challenges_expiry ON mobile_email_challenges(expires_at)`,
  `CREATE TRIGGER IF NOT EXISTS mobile_password_invalidate_challenges AFTER UPDATE OF password_hash ON mobile_credentials
    WHEN OLD.password_hash <> NEW.password_hash BEGIN
      UPDATE mobile_credentials SET auth_version = OLD.auth_version + 1 WHERE user_id = NEW.user_id;
      DELETE FROM mobile_email_challenges WHERE user_id = NEW.user_id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS mobile_identity_invalidate_challenges AFTER UPDATE OF email,is_active ON users
    WHEN OLD.email <> NEW.email OR NEW.is_active = 0 BEGIN
      DELETE FROM mobile_email_challenges WHERE user_id = NEW.id;
      UPDATE mobile_credentials SET email_verified_at = CASE WHEN OLD.email <> NEW.email THEN NULL ELSE email_verified_at END
        WHERE user_id = NEW.id;
    END`,
] as const;
