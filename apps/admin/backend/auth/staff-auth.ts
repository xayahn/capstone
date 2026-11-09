import { getRawDb } from '@/db/runtime';
import { derivePassword, PASSWORD_ITERATIONS, normalizeEmail, randomHex, validEmail } from '@/backend/auth/mobile-auth';

/**
 * Email/password sign-in for internal ParishLink personnel (parish staff,
 * clergy and system administrators).
 *
 * Design notes for reviewers:
 * - Passwords are stored as PBKDF2-SHA-256 hashes with a per-user salt, using the
 *   same iteration count as parishioner accounts.
 * - The browser receives a random 256-bit token in an HttpOnly, SameSite=Strict
 *   cookie. Only the SHA-256 hash of that token is stored in `staff_sessions`.
 * - Five consecutive wrong passwords lock the account for 15 minutes.
 * - Accounts created or reset by a system administrator receive a one-time
 *   temporary password and must choose a new password before using the portal.
 * - Parishioner (mobile) credentials live in a different table and can never
 *   open an internal session.
 */

export const STAFF_SESSION_HOURS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const MAX_SESSIONS_PER_USER = 5;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
type InternalRole = 'parish_staff' | 'clergy' | 'system_admin';
const INTERNAL_ROLE_SQL = `('parish_staff','clergy','system_admin')`;

export class StaffAuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'StaffAuthError';
  }
}

export type StaffIdentity = {
  userId: string;
  email: string;
  fullName: string;
  displayName: string;
  role: InternalRole;
  sessionId: string;
  mustChangePassword: boolean;
};

type CredentialRow = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: number;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  failedAttempts: number;
  lockedUntil: string | null;
  mustChangePassword: number;
};

type SessionRow = {
  sessionId: string;
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: number;
  mustChangePassword: number;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export function validateStaffPassword(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new StaffAuthError('Use a password between 12 and 128 characters.');
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new StaffAuthError('Use uppercase and lowercase letters plus at least one number.');
  }
}

/** Cookie name. Production uses the `__Host-` prefix, which browsers only accept over HTTPS. */
export function staffCookieName(): string {
  return process.env.NODE_ENV === 'production' ? '__Host-pl_staff_session' : 'pl_staff_session';
}

export function staffSessionCookie(token: string, maxAgeSeconds = STAFF_SESSION_HOURS * 60 * 60): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${staffCookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearStaffSessionCookie(): string {
  return staffSessionCookie('', 0);
}

/** Extract the staff session token from a raw Cookie header. Malformed values are ignored. */
export function staffTokenFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const name = staffCookieName();
  const matches = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  if (matches.length !== 1) return null;
  return TOKEN_PATTERN.test(matches[0]) ? matches[0] : null;
}

async function writeStaffAudit(actorId: string | null, action: string, entityId: string | null, outcome: string, detail: string): Promise<void> {
  await getRawDb().prepare(`INSERT INTO audit_logs
    (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
    VALUES (?, ?, ?, 'user', ?, (SELECT home_parish_id FROM users WHERE id = ?), ?, ?)`)
    .bind(crypto.randomUUID(), actorId, action, entityId, entityId, outcome, detail).run();
}

async function issueStaffSession(userId: string, userAgent: string | null, expectedPasswordHash: string): Promise<{ token: string; sessionId: string; expiresAt: string }> {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = base64Url(tokenBytes);
  const tokenHash = await sha256(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + STAFF_SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const userAgentHash = userAgent ? await sha256(userAgent.slice(0, 500)) : null;
  const db = getRawDb();
  // The session is created only if the credential still matches what was verified.
  const inserted = await db.prepare(`INSERT INTO staff_sessions
    (id, user_id, token_hash, expires_at, user_agent_hash)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM staff_credentials sc JOIN users u ON u.id = sc.user_id
      WHERE sc.user_id = ? AND sc.password_hash = ? AND u.is_active = 1
        AND u.role IN ${INTERNAL_ROLE_SQL}
        AND (sc.locked_until IS NULL OR datetime(sc.locked_until) <= datetime('now'))
    )`).bind(sessionId, userId, tokenHash, expiresAt, userAgentHash, userId, expectedPasswordHash).run();
  if (Number(inserted.meta.changes) !== 1) throw new StaffAuthError('Sign-in state changed. Please try again.', 401);
  await db.prepare(`DELETE FROM staff_sessions WHERE user_id = ? AND id IN (
    SELECT id FROM staff_sessions WHERE user_id = ? AND id <> ?
      ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?
  )`).bind(userId, userId, sessionId, MAX_SESSIONS_PER_USER - 1).run();
  return { token, sessionId, expiresAt };
}

export async function signInStaff(input: Record<string, unknown>, userAgent: string | null) {
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const generic = 'The email or password is incorrect, or this account is temporarily locked.';
  if (!validEmail(email) || !password || password.length > 128) throw new StaffAuthError(generic, 401);

  const db = getRawDb();
  const row = await db.prepare(`SELECT u.id, u.full_name AS fullName, u.email, u.role, u.is_active AS isActive,
      sc.password_hash AS passwordHash, sc.password_salt AS passwordSalt,
      sc.password_iterations AS passwordIterations, sc.failed_attempts AS failedAttempts,
      sc.locked_until AS lockedUntil, sc.must_change_password AS mustChangePassword
    FROM users u JOIN staff_credentials sc ON sc.user_id = u.id
    WHERE lower(u.email) = lower(?) AND u.role IN ${INTERNAL_ROLE_SQL} LIMIT 1`).bind(email).first<CredentialRow>();

  // Always derive a hash so unknown accounts take the same time as known ones.
  const candidate = await derivePassword(password, row?.passwordSalt ?? '0'.repeat(32), row?.passwordIterations ?? PASSWORD_ITERATIONS);
  const locked = Boolean(row?.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now());
  if (!row || !row.isActive || locked || !constantTimeEqual(candidate, row.passwordHash)) {
    if (row && !locked) {
      await db.prepare(`UPDATE staff_credentials SET
        failed_attempts = CASE WHEN locked_until IS NOT NULL AND datetime(locked_until) <= datetime('now')
          THEN 1 ELSE failed_attempts + 1 END,
        locked_until = CASE
          WHEN locked_until IS NOT NULL AND datetime(locked_until) <= datetime('now') THEN NULL
          WHEN failed_attempts + 1 >= ? THEN ? ELSE NULL END,
        updated_at = datetime('now')
        WHERE user_id = ? AND password_hash = ?
          AND (locked_until IS NULL OR datetime(locked_until) <= datetime('now'))`)
        .bind(MAX_FAILED_ATTEMPTS, new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString(), row.id, row.passwordHash).run();
      await writeStaffAudit(row.id, 'staff.sign_in', row.id, 'denied', 'Incorrect password or inactive account');
    }
    throw new StaffAuthError(generic, 401);
  }

  await db.batch([
    db.prepare(`UPDATE staff_credentials SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
      WHERE user_id = ?`).bind(row.id),
    db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).bind(row.id),
    db.prepare(`DELETE FROM staff_sessions WHERE user_id = ?
      AND (datetime(expires_at) <= datetime('now') OR revoked_at IS NOT NULL)`).bind(row.id),
  ]);
  const session = await issueStaffSession(row.id, userAgent, row.passwordHash);
  await writeStaffAudit(row.id, 'staff.sign_in', row.id, 'success', `Internal portal sign-in (${row.role})`);
  return { token: session.token, expiresAt: session.expiresAt, mustChangePassword: Boolean(row.mustChangePassword) };
}

/** Resolve the signed-in staff member from a Cookie header, or null when absent/expired/revoked. */
export async function readStaffSession(cookieHeader: string | null | undefined): Promise<StaffIdentity | null> {
  const token = staffTokenFromCookieHeader(cookieHeader);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const db = getRawDb();
  const row = await db.prepare(`SELECT ss.id AS sessionId, u.id, u.full_name AS fullName, u.email, u.role,
      u.is_active AS isActive, sc.must_change_password AS mustChangePassword
    FROM staff_sessions ss
    JOIN users u ON u.id = ss.user_id
    JOIN staff_credentials sc ON sc.user_id = u.id
    WHERE ss.token_hash = ? AND ss.revoked_at IS NULL AND datetime(ss.expires_at) > datetime('now')
      AND u.role IN ${INTERNAL_ROLE_SQL} LIMIT 1`).bind(tokenHash).first<SessionRow>();
  if (!row || !row.isActive) return null;
  await db.prepare(`UPDATE staff_sessions SET last_seen_at = datetime('now') WHERE id = ?`).bind(row.sessionId).run();
  return {
    userId: row.id,
    email: row.email,
    fullName: row.fullName,
    displayName: row.fullName,
    role: row.role as StaffIdentity['role'],
    sessionId: row.sessionId,
    mustChangePassword: Boolean(row.mustChangePassword),
  };
}

export async function signOutStaff(cookieHeader: string | null | undefined): Promise<void> {
  const identity = await readStaffSession(cookieHeader);
  if (!identity) return;
  await getRawDb().prepare(`UPDATE staff_sessions SET revoked_at = datetime('now') WHERE id = ?`).bind(identity.sessionId).run();
  await writeStaffAudit(identity.userId, 'staff.sign_out', identity.userId, 'success', 'Internal portal sign-out');
}

export async function changeStaffPassword(identity: StaffIdentity, input: Record<string, unknown>): Promise<void> {
  const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
  const confirmPassword = typeof input.confirmPassword === 'string' ? input.confirmPassword : '';
  if (!currentPassword || currentPassword.length > 128) throw new StaffAuthError('The current password is incorrect.');
  validateStaffPassword(newPassword);
  if (newPassword !== confirmPassword) throw new StaffAuthError('The new passwords do not match.');
  if (currentPassword === newPassword) throw new StaffAuthError('Choose a new password that is different from the current password.');

  const db = getRawDb();
  const credential = await db.prepare(`SELECT password_hash AS passwordHash, password_salt AS passwordSalt,
      password_iterations AS passwordIterations FROM staff_credentials WHERE user_id = ?`)
    .bind(identity.userId).first<{ passwordHash: string; passwordSalt: string; passwordIterations: number }>();
  if (!credential) throw new StaffAuthError('The current password is incorrect.');
  const candidate = await derivePassword(currentPassword, credential.passwordSalt, credential.passwordIterations);
  if (!constantTimeEqual(candidate, credential.passwordHash)) throw new StaffAuthError('The current password is incorrect.');

  const salt = randomHex();
  const passwordHash = await derivePassword(newPassword, salt, PASSWORD_ITERATIONS);
  const results = await db.batch([
    db.prepare(`UPDATE staff_credentials SET password_hash = ?, password_salt = ?, password_iterations = ?,
        must_change_password = 0, failed_attempts = 0, locked_until = NULL,
        password_changed_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ? AND password_hash = ?`)
      .bind(passwordHash, salt, PASSWORD_ITERATIONS, identity.userId, credential.passwordHash),
    // Keep the current browser signed in; end every other session.
    db.prepare(`UPDATE staff_sessions SET revoked_at = datetime('now')
      WHERE user_id = ? AND id <> ? AND revoked_at IS NULL`).bind(identity.userId, identity.sessionId),
  ]);
  if (Number(results[0]?.meta.changes) < 1) throw new StaffAuthError('Your password changed in another request. Sign in again.', 409);
  await writeStaffAudit(identity.userId, 'staff.password.change', identity.userId, 'success', 'Password changed; other sessions ended');
}

const TEMP_ALPHABET = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnpqrstuvwxyz',
  digit: '23456789',
};

function randomFrom(alphabet: string, count: number): string[] {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
}

/** A 16-character temporary password that always satisfies the password policy. */
export function generateTemporaryPassword(): string {
  const all = TEMP_ALPHABET.upper + TEMP_ALPHABET.lower + TEMP_ALPHABET.digit;
  const characters = [
    ...randomFrom(TEMP_ALPHABET.upper, 2),
    ...randomFrom(TEMP_ALPHABET.lower, 2),
    ...randomFrom(TEMP_ALPHABET.digit, 2),
    ...randomFrom(all, 10),
  ];
  const order = new Uint8Array(characters.length);
  crypto.getRandomValues(order);
  return characters
    .map((character, index) => ({ character, key: order[index] }))
    .sort((left, right) => left.key - right.key)
    .map((item) => item.character)
    .join('');
}

/**
 * System administrators issue a one-time temporary password for a new or
 * locked-out internal account. All of that person's sessions are ended.
 */
export async function issueTemporaryStaffPassword(actor: { id: string; role: string }, targetUserId: string): Promise<{ temporaryPassword: string; email: string }> {
  if (actor.role !== 'system_admin') throw new StaffAuthError('Only system administrators can issue temporary passwords.', 403);
  if (typeof targetUserId !== 'string' || !targetUserId || targetUserId.length > 100) throw new StaffAuthError('Choose an internal user.');
  if (targetUserId === actor.id) throw new StaffAuthError('Use "Change password" for your own account.', 409);
  const db = getRawDb();
  const target = await db.prepare(`SELECT id, email, is_active AS isActive FROM users
    WHERE id = ? AND role IN ${INTERNAL_ROLE_SQL}`).bind(targetUserId).first<{ id: string; email: string; isActive: number }>();
  if (!target) throw new StaffAuthError('Internal user not found.', 404);
  if (!target.isActive) throw new StaffAuthError('Activate this account before issuing a temporary password.', 409);

  const temporaryPassword = generateTemporaryPassword();
  const salt = randomHex();
  const passwordHash = await derivePassword(temporaryPassword, salt, PASSWORD_ITERATIONS);
  await db.batch([
    db.prepare(`INSERT INTO staff_credentials
        (user_id, password_hash, password_salt, password_iterations, must_change_password)
        VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash,
        password_salt = excluded.password_salt, password_iterations = excluded.password_iterations,
        must_change_password = 1, failed_attempts = 0, locked_until = NULL,
        password_changed_at = datetime('now'), updated_at = datetime('now')`)
      .bind(target.id, passwordHash, salt, PASSWORD_ITERATIONS),
    db.prepare(`UPDATE staff_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).bind(target.id),
  ]);
  await writeStaffAudit(actor.id, 'staff.password.temporary', target.id, 'success', 'Temporary password issued; sessions ended');
  return { temporaryPassword, email: target.email };
}
