import * as workers from 'cloudflare:workers';
import { ensurePublicRuntimeDatabase, getRawDb } from '@/db/runtime';
import { derivePassword, MobileServiceError, normalizeEmail, PASSWORD_ITERATIONS, randomHex, validEmail, validatePassword, type MobileActor } from '@/backend/auth/mobile-auth';
import { createAccountMailer, type AccountMailer } from '@/backend/auth/account-mailer';
import { enforceMobileIpRateLimit, enforceMobileRateLimit } from '@/backend/security/mobile-rate-limit';
import { recordServerFailure } from '@/backend/observability/server-log';

type Purpose = 'password_reset' | 'email_verification';
type Dependencies = { mailer?: AccountMailer; schedule?: (work: () => Promise<void>) => void };
const ACCEPTED = { accepted: true, message: 'If an eligible account exists, a reset code will be sent.' } as const;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVALID_CODE = 'The code is invalid or expired. Request a new code and try again.';
const UNAVAILABLE = 'Account email is unavailable. Contact parish staff or try again later.';

function emailInput(input: Record<string, unknown>): string {
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  if (!validEmail(email)) throw new MobileServiceError('Enter a valid email address.');
  return email;
}

async function codeHash(code: unknown): Promise<string> {
  const normalized = typeof code === 'string' && code.length <= 100 ? code.toUpperCase().replace(/[\s-]/g, '') : '';
  const bounded = /^[A-HJ-NP-Z2-9]{12}$/.test(normalized) ? normalized : 'invalid-code';
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bounded)))].map(n => n.toString(16).padStart(2, '0')).join('');
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  // 32 divides 256 exactly: masking is uniform, yielding 60 bits of entropy.
  return [...bytes].map(value => ALPHABET[value & 31]).join('');
}

function deliveryDependencies(dependencies: Dependencies): { mailer: AccountMailer; schedule: (work: () => Promise<void>) => void } {
  let mailer: AccountMailer;
  try { mailer = dependencies.mailer ?? createAccountMailer(workers.env); }
  catch { throw new MobileServiceError(UNAVAILABLE, 503); }
  const schedule = dependencies.schedule ?? ((work: () => Promise<void>) => {
    if (typeof workers.waitUntil !== 'function') throw new MobileServiceError(UNAVAILABLE, 503);
    // Eligibility and provider I/O both occur after scheduling. Public response
    // timing cannot distinguish an unknown email from a provider network wait.
    workers.waitUntil(Promise.resolve().then(work).catch(error => { recordServerFailure('account-email-task', error); }));
  });
  return { mailer, schedule };
}

async function issueChallenge(email: string, purpose: Purpose, mailer: AccountMailer, actor?: MobileActor): Promise<void> {
  const db = getRawDb();
  const row = await db.prepare(`SELECT u.id, u.email, mc.auth_version AS version, mc.email_verified_at AS verifiedAt
    FROM users u JOIN mobile_credentials mc ON mc.user_id=u.id
    WHERE lower(u.email)=? AND u.role='parishioner' AND u.is_active=1
      AND (? IS NULL OR u.id=?) AND (? IS NULL OR EXISTS (
        SELECT 1 FROM mobile_sessions s WHERE s.id=? AND s.user_id=u.id AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now')))`)
    .bind(normalizeEmail(email), actor?.id ?? null, actor?.id ?? null, actor?.sessionId ?? null, actor?.sessionId ?? null)
    .first<{ id: string; email: string; version: number; verifiedAt: string | null }>();
  if (!row || purpose === 'email_verification' && row.verifiedAt) return;
  const code = generateCode();
  const hash = await codeHash(code);
  const id = crypto.randomUUID();
  const inserted = await db.prepare(`INSERT INTO mobile_email_challenges
      (id,user_id,purpose,session_id,email,code_hash,credential_version,expires_at)
    SELECT ?,u.id,?,?,u.email,?,mc.auth_version,unixepoch()+900
    FROM users u JOIN mobile_credentials mc ON mc.user_id=u.id
    WHERE u.id=? AND u.email=? AND u.is_active=1 AND u.role='parishioner' AND mc.auth_version=?
      AND (? IS NULL OR EXISTS (SELECT 1 FROM mobile_sessions s WHERE s.id=? AND s.user_id=u.id
        AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now')))
    ON CONFLICT(user_id,purpose) DO UPDATE SET id=excluded.id, session_id=excluded.session_id,
      email=excluded.email, code_hash=excluded.code_hash, credential_version=excluded.credential_version,
      expires_at=excluded.expires_at, attempts=0, consumed_by=NULL, delivery_status='pending', created_at=unixepoch()`)
    .bind(id,purpose,actor?.sessionId ?? null,hash,row.id,row.email,row.version,actor?.sessionId ?? null,actor?.sessionId ?? null).run();
  if (Number(inserted.meta.changes) !== 1) return;
  try {
    // Only this transient closure contains plaintext. Never persist/retry/log it.
    await mailer.send({ email: row.email, purpose, code, challengeId: id });
    await db.prepare(`UPDATE mobile_email_challenges SET delivery_status='ready'
      WHERE id=? AND consumed_by IS NULL AND expires_at>unixepoch() AND EXISTS (
        SELECT 1 FROM users u JOIN mobile_credentials mc ON mc.user_id=u.id
        WHERE u.id=mobile_email_challenges.user_id AND u.is_active=1 AND u.role='parishioner' AND u.email=mobile_email_challenges.email
          AND mc.auth_version=mobile_email_challenges.credential_version)
      AND (session_id IS NULL OR EXISTS (SELECT 1 FROM mobile_sessions s WHERE s.id=mobile_email_challenges.session_id
        AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now')))`)
      .bind(id).run();
  } catch (error) {
    await db.prepare('DELETE FROM mobile_email_challenges WHERE id=?').bind(id).run();
    recordServerFailure('account-email-delivery', error);
  }
  // Bounded cleanup, independent of delivery result; no email/code in logs.
  await db.prepare('DELETE FROM mobile_email_challenges WHERE id IN (SELECT id FROM mobile_email_challenges WHERE expires_at<unixepoch()-86400 LIMIT 100)').run();
}

export async function requestMobilePasswordReset(request: Request, input: Record<string, unknown>, dependencies: Dependencies = {}) {
  const email = emailInput(input);
  const delivery = deliveryDependencies(dependencies); // Identical 503 for every address when unavailable.
  await ensurePublicRuntimeDatabase();
  await enforceMobileIpRateLimit(request, 'auth-reset-request-ip', 20, 3600);
  await enforceMobileRateLimit(email, 'auth-reset-request-email', 3, 900);
  delivery.schedule(() => issueChallenge(email, 'password_reset', delivery.mailer));
  return ACCEPTED;
}

export async function requestMobileEmailVerification(request: Request, actor: MobileActor, dependencies: Dependencies = {}) {
  const delivery = deliveryDependencies(dependencies);
  await ensurePublicRuntimeDatabase();
  await enforceMobileIpRateLimit(request, 'auth-verify-request-ip', 20, 3600);
  await enforceMobileRateLimit(actor.id, 'auth-verify-request-account', 3, 900);
  delivery.schedule(() => issueChallenge(actor.email, 'email_verification', delivery.mailer, actor));
  return { accepted: true } as const;
}

const ELIGIBLE = `consumed_by IS NULL AND delivery_status='ready' AND expires_at>unixepoch() AND attempts<5
  AND EXISTS (SELECT 1 FROM users u JOIN mobile_credentials mc ON mc.user_id=u.id
    WHERE u.id=mobile_email_challenges.user_id AND u.is_active=1 AND u.role='parishioner'
      AND u.email=mobile_email_challenges.email AND mc.auth_version=mobile_email_challenges.credential_version)`;

export async function confirmMobilePasswordReset(request: Request, input: Record<string, unknown>): Promise<void> {
  await ensurePublicRuntimeDatabase();
  const email = emailInput(input);
  await enforceMobileIpRateLimit(request, 'auth-reset-confirm-ip', 30, 900);
  await enforceMobileRateLimit(email, 'auth-reset-confirm-email', 10, 900);
  const password = typeof input.newPassword === 'string' ? input.newPassword : '';
  validatePassword(password);
  if (password !== input.confirmPassword) throw new MobileServiceError('The new passwords do not match.');
  const hash = await codeHash(input.code);
  const db = getRawDb();
  await db.prepare(`UPDATE mobile_email_challenges SET attempts=attempts+1 WHERE lower(email)=?
    AND purpose='password_reset' AND ${ELIGIBLE} AND code_hash<>?`).bind(email,hash).run();
  // Hash even an unknown/wrong challenge, avoiding an account-existence oracle.
  const salt = randomHex();
  const passwordHash = await derivePassword(password,salt,PASSWORD_ITERATIONS);
  const claim = crypto.randomUUID();
  const claimed = `SELECT user_id FROM mobile_email_challenges WHERE consumed_by=? AND purpose='password_reset'`;
  const result = await db.batch([
    db.prepare(`UPDATE mobile_email_challenges SET consumed_by=? WHERE lower(email)=? AND purpose='password_reset'
      AND code_hash=? AND ${ELIGIBLE}`).bind(claim,email,hash),
    db.prepare(`DELETE FROM push_devices WHERE user_id IN (${claimed})`).bind(claim),
    db.prepare(`DELETE FROM mobile_sessions WHERE user_id IN (${claimed})`).bind(claim),
    db.prepare(`INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,parish_id,outcome,detail)
      SELECT ?,u.id,'mobile.password.reset','user',u.id,u.home_parish_id,'success','Email code redeemed; all sessions revoked'
      FROM users u WHERE u.id IN (${claimed})`).bind(crypto.randomUUID(),claim),
    db.prepare(`UPDATE mobile_credentials SET password_hash=?,password_salt=?,password_iterations=?,
      failed_attempts=0,locked_until=NULL,password_changed_at=datetime('now'),updated_at=datetime('now'),
      email_verified_at=COALESCE(email_verified_at,datetime('now')) WHERE user_id IN (${claimed})`)
      .bind(passwordHash,salt,PASSWORD_ITERATIONS,claim),
  ]);
  // D1's change count includes trigger/cascade writes. The credential update is
  // bounded to the one claimed user, but its invalidation trigger adds changes.
  // A zero/missing count still fails; a successful triggered update must not
  // return an invalid-code error after committing the new password.
  if (Number(result[0]?.meta.changes) !== 1 || !(Number(result[4]?.meta.changes) >= 1)) throw new MobileServiceError(INVALID_CODE);
}

export async function confirmMobileEmailVerification(request: Request, actor: MobileActor, input: Record<string, unknown>) {
  await ensurePublicRuntimeDatabase();
  await enforceMobileIpRateLimit(request, 'auth-verify-confirm-ip', 30, 900);
  await enforceMobileRateLimit(actor.id, 'auth-verify-confirm-account', 10, 900);
  const db = getRawDb(), hash = await codeHash(input.code), claim = crypto.randomUUID();
  const session = `session_id=? AND EXISTS (SELECT 1 FROM mobile_sessions s WHERE s.id=mobile_email_challenges.session_id
    AND s.user_id=mobile_email_challenges.user_id AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now'))`;
  await db.prepare(`UPDATE mobile_email_challenges SET attempts=attempts+1 WHERE user_id=?
    AND purpose='email_verification' AND ${ELIGIBLE} AND ${session} AND code_hash<>?`).bind(actor.id,actor.sessionId,hash).run();
  const result = await db.batch([
    db.prepare(`UPDATE mobile_email_challenges SET consumed_by=? WHERE user_id=? AND purpose='email_verification'
      AND code_hash=? AND ${ELIGIBLE} AND ${session}`).bind(claim,actor.id,hash,actor.sessionId),
    db.prepare(`UPDATE mobile_credentials SET email_verified_at=COALESCE(email_verified_at,datetime('now')),updated_at=datetime('now')
      WHERE user_id IN (SELECT user_id FROM mobile_email_challenges WHERE consumed_by=?)`).bind(claim),
    db.prepare(`INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,parish_id,outcome,detail)
      SELECT ?,u.id,'mobile.email.verify','user',u.id,u.home_parish_id,'success','Email code redeemed'
      FROM users u JOIN mobile_email_challenges c ON c.user_id=u.id WHERE c.consumed_by=?`).bind(crypto.randomUUID(),claim),
    db.prepare('DELETE FROM mobile_email_challenges WHERE consumed_by=?').bind(claim),
  ]);
  if (Number(result[0]?.meta.changes) !== 1 || Number(result[1]?.meta.changes) !== 1) throw new MobileServiceError(INVALID_CODE);
  return { emailVerified: true } as const;
}
