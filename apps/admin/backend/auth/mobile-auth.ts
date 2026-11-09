import { ensurePublicRuntimeDatabase, getRawDb } from '@/db/runtime';
import { validPhoneNumber } from '@/shared/validation';

export const PASSWORD_ITERATIONS = 210_000;
const SESSION_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type MobileProfile = {
  id: string;
  displayName: string;
  email: string;
  mobileNumber: string;
  homeParishId: string;
  notificationsEnabled: boolean;
  emailVerified?: boolean;
};

export type MobileActor = MobileProfile & { sessionId: string };

export class MobileServiceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'MobileServiceError';
  }
}

type CredentialRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  homeParishId: string;
  isActive: number;
  notificationsEnabled: number;
  emailVerifiedAt: string | null;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  failedAttempts: number;
  lockedUntil: string | null;
};

type SessionRow = {
  sessionId: string;
  id: string;
  fullName: string;
  email: string;
  phone: string;
  homeParishId: string;
  isActive: number;
  notificationsEnabled: number;
  emailVerifiedAt: string | null;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value) && value.length <= 254;
}

export function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new MobileServiceError('Use a password between 12 and 128 characters.');
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new MobileServiceError('Use uppercase and lowercase letters plus at least one number.');
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomHex(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
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

export async function derivePassword(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function profile(row: Pick<CredentialRow, 'id' | 'fullName' | 'email' | 'phone' | 'homeParishId' | 'notificationsEnabled' | 'emailVerifiedAt'>): MobileProfile {
  return {
    id: row.id,
    displayName: row.fullName,
    email: row.email,
    mobileNumber: row.phone,
    homeParishId: row.homeParishId,
    notificationsEnabled: Boolean(row.notificationsEnabled),
    emailVerified: Boolean(row.emailVerifiedAt),
  };
}

async function issueSession(userId: string, userAgent: string | null, expectedPasswordHash: string): Promise<{ accessToken: string; sessionId: string }> {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const accessToken = base64Url(tokenBytes);
  const tokenHash = await sha256(accessToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const userAgentHash = userAgent ? await sha256(userAgent.slice(0, 500)) : null;
  const inserted = await getRawDb().prepare(`INSERT INTO mobile_sessions
    (id, user_id, token_hash, expires_at, user_agent_hash)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM mobile_credentials mc JOIN users u ON u.id = mc.user_id
      WHERE mc.user_id = ? AND mc.password_hash = ? AND u.is_active = 1
        AND (mc.locked_until IS NULL OR datetime(mc.locked_until) <= datetime('now'))
    )`).bind(sessionId, userId, tokenHash, expiresAt, userAgentHash, userId, expectedPasswordHash).run();
  if (Number(inserted.meta.changes) !== 1) throw new MobileServiceError('Sign-in state changed. Please try again.', 401);
  await getRawDb().prepare(`DELETE FROM mobile_sessions WHERE user_id = ? AND id IN (
    SELECT id FROM mobile_sessions WHERE user_id = ? AND id <> ?
      ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 4
  )`).bind(userId, userId, sessionId).run();
  return { accessToken, sessionId };
}

export async function signUpMobile(input: Record<string, unknown>, userAgent: string | null) {
  await ensurePublicRuntimeDatabase();
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim().replace(/\s+/g, ' ') : '';
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const mobileNumber = typeof input.mobileNumber === 'string' ? input.mobileNumber.trim() : '';
  const homeParishId = typeof input.homeParishId === 'string' ? input.homeParishId : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const confirmPassword = typeof input.confirmPassword === 'string' ? input.confirmPassword : '';
  if (displayName.length < 3 || displayName.length > 120) throw new MobileServiceError('Enter your complete name.');
  if (!validEmail(email)) throw new MobileServiceError('Enter a valid email address.');
  if (!validPhoneNumber(mobileNumber)) throw new MobileServiceError('Enter a valid mobile number.');
  validatePassword(password);
  if (password !== confirmPassword) throw new MobileServiceError('The passwords do not match.');
  if (input.acceptPrivacyNotice !== true) throw new MobileServiceError('Review and accept the privacy notice to continue.');

  const db = getRawDb();
  const parish = await db.prepare('SELECT id FROM parishes WHERE id = ? AND is_active = 1').bind(homeParishId).first<{ id: string }>();
  if (!parish) throw new MobileServiceError('Choose a valid home parish.');
  const existing = await db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1').bind(email).first<{ id: string }>();
  if (existing) throw new MobileServiceError('An account already uses that email address.', 409);

  const userId = crypto.randomUUID();
  const salt = randomHex();
  const passwordHash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  try {
    await db.batch([
    db.prepare(`INSERT INTO users
      (id, email, full_name, role, home_parish_id, phone)
      VALUES (?, ?, ?, 'parishioner', ?, ?)`).bind(userId, email, displayName, homeParishId, mobileNumber),
    db.prepare(`INSERT INTO mobile_credentials
      (user_id, password_hash, password_salt, password_iterations)
      VALUES (?, ?, ?, ?)`).bind(userId, passwordHash, salt, PASSWORD_ITERATIONS),
    db.prepare(`INSERT INTO notifications
      (id, recipient_user_id, type, title, body, entity_type)
      VALUES (?, ?, 'account', 'Welcome to ParishLink',
        'Your account is ready. Requests still require review and approval by authorized parish personnel.', 'profile')`)
      .bind(crypto.randomUUID(), userId),
    db.prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      VALUES (?, ?, 'mobile.account.create', 'user', ?, ?, 'success', 'Privacy notice accepted; parishioner account created')`)
      .bind(crypto.randomUUID(), userId, userId, homeParishId),
    ]);
  } catch (error) {
    // The preflight check is not a lock. A second signup can win during hashing.
    // Confirm the duplicate rather than exposing a database constraint error or
    // misclassifying an unrelated storage failure as an account conflict.
    const raced = await db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1')
      .bind(email).first<{ id: string }>().catch(() => null);
    if (raced && raced.id !== userId) throw new MobileServiceError('An account already uses that email address.', 409);
    throw error;
  }
  const session = await issueSession(userId, userAgent, passwordHash);
  return { mode: 'api' as const, accessToken: session.accessToken, profile: { id: userId, displayName, email, mobileNumber, homeParishId, notificationsEnabled: true, emailVerified: false } };
}

export async function signInMobile(input: Record<string, unknown>, userAgent: string | null) {
  await ensurePublicRuntimeDatabase();
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!validEmail(email) || !password || password.length > 128) {
    throw new MobileServiceError('The email or password is incorrect.', 401);
  }
  const db = getRawDb();
  const row = await db.prepare(`SELECT u.id, u.full_name AS fullName, u.email, u.phone,
      u.home_parish_id AS homeParishId, u.is_active AS isActive,
      mc.password_hash AS passwordHash, mc.password_salt AS passwordSalt,
      mc.password_iterations AS passwordIterations, mc.failed_attempts AS failedAttempts,
      mc.locked_until AS lockedUntil, mc.notifications_enabled AS notificationsEnabled,
      mc.email_verified_at AS emailVerifiedAt
    FROM users u JOIN mobile_credentials mc ON mc.user_id = u.id
    WHERE lower(u.email) = lower(?) AND u.role = 'parishioner' LIMIT 1`).bind(email).first<CredentialRow>();

  const candidateHash = await derivePassword(
    password,
    row?.passwordSalt ?? '0'.repeat(32),
    row?.passwordIterations ?? PASSWORD_ITERATIONS,
  );
  const locked = Boolean(row?.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now());
  if (!row || !row.isActive || locked || !constantTimeEqual(candidateHash, row.passwordHash)) {
    if (row && !locked) {
      // Derive the count in SQL, never from a stale concurrent SELECT.
      await db.prepare(`UPDATE mobile_credentials SET
        failed_attempts = CASE WHEN locked_until IS NOT NULL AND datetime(locked_until) <= datetime('now')
          THEN 1 ELSE failed_attempts + 1 END,
        locked_until = CASE
          WHEN locked_until IS NOT NULL AND datetime(locked_until) <= datetime('now') THEN NULL
          WHEN failed_attempts + 1 >= ? THEN ? ELSE NULL END,
        updated_at = datetime('now')
        WHERE user_id = ? AND password_hash = ?
          AND (locked_until IS NULL OR datetime(locked_until) <= datetime('now'))`)
        .bind(MAX_FAILED_ATTEMPTS, new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString(), row.id, row.passwordHash).run();
    }
    throw new MobileServiceError('The email or password is incorrect, or this account is temporarily locked.', 401);
  }

  const reset = await db.prepare(`UPDATE mobile_credentials SET failed_attempts = 0, locked_until = NULL,
    updated_at = datetime('now') WHERE user_id = ? AND password_hash = ? AND failed_attempts = ?
    AND (locked_until IS NULL OR datetime(locked_until) <= datetime('now'))`)
    .bind(row.id, row.passwordHash, row.failedAttempts).run();
  if (Number(reset.meta.changes) !== 1) throw new MobileServiceError('Sign-in state changed. Please try again.', 401);
  await db.batch([
    db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?`).bind(row.id),
    db.prepare(`DELETE FROM mobile_sessions WHERE user_id = ? AND (datetime(expires_at) <= datetime('now') OR revoked_at IS NOT NULL)`).bind(row.id),
  ]);
  const session = await issueSession(row.id, userAgent, row.passwordHash);
  return { mode: 'api' as const, accessToken: session.accessToken, profile: profile(row) };
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) throw new MobileServiceError('Sign in to continue.', 401);
  return match[1];
}

export async function requireMobileActor(request: Request): Promise<MobileActor> {
  await ensurePublicRuntimeDatabase();
  const tokenHash = await sha256(bearerToken(request));
  const row = await getRawDb().prepare(`SELECT ms.id AS sessionId, u.id, u.full_name AS fullName,
      u.email, u.phone, u.home_parish_id AS homeParishId, u.is_active AS isActive,
      mc.notifications_enabled AS notificationsEnabled, mc.email_verified_at AS emailVerifiedAt
    FROM mobile_sessions ms JOIN users u ON u.id = ms.user_id
    JOIN mobile_credentials mc ON mc.user_id = u.id
    WHERE ms.token_hash = ? AND ms.revoked_at IS NULL AND datetime(ms.expires_at) > datetime('now')
      AND u.role = 'parishioner' LIMIT 1`).bind(tokenHash).first<SessionRow>();
  if (!row || !row.isActive) throw new MobileServiceError('Your session has expired. Sign in again.', 401);
  await getRawDb().prepare(`UPDATE mobile_sessions SET last_seen_at = datetime('now') WHERE id = ?`).bind(row.sessionId).run();
  return { ...profile(row), sessionId: row.sessionId };
}

export async function restoreMobileSession(request: Request) {
  const actor = await requireMobileActor(request);
  return {
    mode: 'api' as const,
    profile: {
      id: actor.id,
      displayName: actor.displayName,
      email: actor.email,
      mobileNumber: actor.mobileNumber,
      homeParishId: actor.homeParishId,
      notificationsEnabled: actor.notificationsEnabled,
      emailVerified: Boolean(actor.emailVerified),
    },
  };
}

export async function signOutMobile(request: Request): Promise<void> {
  const actor = await requireMobileActor(request);
  await getRawDb().prepare(`UPDATE mobile_sessions SET revoked_at = datetime('now') WHERE id = ?`).bind(actor.sessionId).run();
}

export async function changeMobilePassword(request: Request, input: Record<string, unknown>): Promise<void> {
  const actor = await requireMobileActor(request);
  const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
  const confirmPassword = typeof input.confirmPassword === 'string' ? input.confirmPassword : '';
  if (!currentPassword || currentPassword.length > 128) throw new MobileServiceError('The current password is incorrect.', 400);
  validatePassword(newPassword);
  if (newPassword !== confirmPassword) throw new MobileServiceError('The new passwords do not match.');
  if (currentPassword === newPassword) throw new MobileServiceError('Choose a new password that is different from the current password.');
  const credential = await getRawDb().prepare(`SELECT password_hash AS passwordHash,
    password_salt AS passwordSalt, password_iterations AS passwordIterations
    FROM mobile_credentials WHERE user_id = ?`).bind(actor.id).first<{
      passwordHash: string; passwordSalt: string; passwordIterations: number;
    }>();
  if (!credential) throw new MobileServiceError('The current password is incorrect.', 400);
  const candidate = await derivePassword(currentPassword, credential.passwordSalt, credential.passwordIterations);
  if (!constantTimeEqual(candidate, credential.passwordHash)) throw new MobileServiceError('The current password is incorrect.', 400);
  const salt = randomHex();
  const passwordHash = await derivePassword(newPassword, salt, PASSWORD_ITERATIONS);
  const changed = await getRawDb().batch([
    getRawDb().prepare(`UPDATE mobile_credentials SET password_hash = ?, password_salt = ?,
      password_iterations = ?, failed_attempts = 0, locked_until = NULL,
      password_changed_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ? AND password_hash = ?
        AND EXISTS (SELECT 1 FROM mobile_sessions WHERE id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now'))`)
      .bind(passwordHash, salt, PASSWORD_ITERATIONS, actor.id, credential.passwordHash, actor.sessionId),
    getRawDb().prepare(`UPDATE mobile_sessions SET revoked_at = datetime('now')
      WHERE user_id = ? AND id <> ? AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM mobile_credentials WHERE user_id = ? AND password_hash = ?)`)
      .bind(actor.id, actor.sessionId, actor.id, passwordHash),
    getRawDb().prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      SELECT ?, ?, 'mobile.password.change', 'user', ?, ?, 'success', 'Password changed; other sessions revoked'
      WHERE EXISTS (SELECT 1 FROM mobile_credentials WHERE user_id = ? AND password_hash = ?)`)
      .bind(crypto.randomUUID(), actor.id, actor.id, actor.homeParishId, actor.id, passwordHash),
  ]);
  // D1 includes credential-version and challenge-invalidation trigger writes
  // in meta.changes; this conditional update still targets one credential row.
  if (!(Number(changed[0]?.meta.changes) >= 1)) throw new MobileServiceError('Password or session changed in another request. Sign in again before retrying.', 409);
}
