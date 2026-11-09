import { env } from 'cloudflare:workers';
import { getRawDb, ensurePublicRuntimeDatabase } from '@/db/runtime';
import { MobileServiceError, type MobileActor } from '@/backend/auth/mobile-auth';
import { callExpo, expoResult, providerErrorCode, PushProviderError } from '@/backend/notifications/expo-provider';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EXPO_TOKEN = /^(?:ExponentPushToken|ExpoPushToken)\[[a-zA-Z0-9_-]{10,200}\]$/;
const BATCH = 25;
const MAX_ATTEMPTS = 6;
const MAX_AGE_SECONDS = 24 * 60 * 60;
export type PushConfiguration = { projectId: string; accessToken?: string };

export function pushConfiguration(): PushConfiguration | null {
  if (env.PUSH_NOTIFICATIONS_ENABLED !== 'true') return null;
  const projectId = env.EXPO_PROJECT_ID?.trim();
  if (!projectId || !UUID.test(projectId)) throw new MobileServiceError('Push notifications are not configured.', 503);
  const accessToken = env.EXPO_ACCESS_TOKEN?.trim() || undefined;
  if (accessToken && /[\s\u0000-\u001f]/.test(accessToken)) throw new MobileServiceError('Push notifications are not configured.', 503);
  return { projectId: projectId.toLowerCase(), accessToken };
}

function installationId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new MobileServiceError('A valid installation identifier is required.');
  return value.toLowerCase();
}

export async function registerPushDevice(actor: MobileActor, input: Record<string, unknown>): Promise<{ registered: true }> {
  const config = pushConfiguration();
  if (!config) throw new MobileServiceError('Push notifications are not configured.', 503);
  const id = installationId(input.installationId);
  if (typeof input.expoPushToken !== 'string' || !EXPO_TOKEN.test(input.expoPushToken)) throw new MobileServiceError('A valid device push token is required.');
  if (input.platform !== 'ios' && input.platform !== 'android') throw new MobileServiceError('Push notifications require an iOS or Android device.');
  if (typeof input.projectId !== 'string' || input.projectId.toLowerCase() !== config.projectId) throw new MobileServiceError('The push project does not match this ParishLink server.');
  await ensurePublicRuntimeDatabase();
  const db = getRawDb();
  const count = await db.prepare(`SELECT count(*) AS count FROM push_devices d
    JOIN mobile_sessions s ON s.id=d.session_id
    WHERE d.user_id=? AND d.enabled=1 AND d.id<>? AND d.expo_push_token<>?
      AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now')`)
    .bind(actor.id, id, input.expoPushToken).first<{ count: number }>();
  if (Number(count?.count) >= 10) throw new MobileServiceError('Too many devices are registered. Sign out of an older device first.', 409);
  // One token has one owner. Rebinding a physical installation during account
  // switching immediately makes the old immutable user/session deliveries ineligible.
  const existingToken = await db.prepare('SELECT id FROM push_devices WHERE expo_push_token=?')
    .bind(input.expoPushToken).first<{ id: string }>();
  if (existingToken && existingToken.id !== id) throw new MobileServiceError('This push token is registered to a different installation. Refresh device registration.', 409);
  // mobile_sessions is a normal SQLite rowid table. Compare the live sessions'
  // insertion order, since created_at has only one-second precision and ties
  // must not let an older in-flight registration replace a newer sign-in.
  const saved = await db.batch([
    db.prepare(`INSERT INTO push_devices(id,user_id,session_id,expo_push_token,project_id,platform,enabled)
      SELECT ?,?,?,?,?,?,1 WHERE EXISTS(SELECT 1 FROM mobile_sessions WHERE id=? AND user_id=?
        AND revoked_at IS NULL AND datetime(expires_at)>datetime('now'))
      ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,session_id=excluded.session_id,
        expo_push_token=excluded.expo_push_token,project_id=excluded.project_id,platform=excluded.platform,
        enabled=1,updated_at=unixepoch()
      WHERE push_devices.session_id=excluded.session_id
        OR NOT EXISTS(SELECT 1 FROM mobile_sessions prior WHERE prior.id=push_devices.session_id
          AND prior.revoked_at IS NULL AND datetime(prior.expires_at)>datetime('now'))
        OR EXISTS(SELECT 1 FROM mobile_sessions incoming JOIN mobile_sessions prior ON prior.id=push_devices.session_id
          WHERE incoming.id=excluded.session_id AND incoming.rowid>prior.rowid)`)
      .bind(id, actor.id, actor.sessionId, input.expoPushToken, config.projectId, input.platform, actor.sessionId, actor.id),
  ]);
  if (Number(saved[0]?.meta.changes) !== 1) {
    const active = await db.prepare("SELECT id FROM mobile_sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND datetime(expires_at)>datetime('now')")
      .bind(actor.sessionId, actor.id).first();
    if (active) throw new MobileServiceError('A newer sign-in is already registered on this installation.', 409);
    throw new MobileServiceError('Sign in again to register this device.', 401);
  }
  return { registered: true };
}

export async function unregisterPushDevice(actor: MobileActor, input: Record<string, unknown>): Promise<void> {
  const id = installationId(input.installationId);
  await ensurePublicRuntimeDatabase();
  // A late logout from an old session must not unregister a newer sign-in.
  await getRawDb().prepare('UPDATE push_devices SET enabled=0,updated_at=unixepoch() WHERE id=? AND user_id=? AND session_id=?')
    .bind(id, actor.id, actor.sessionId).run();
}

type Delivery = {
  id: string; notificationId: string; deviceId: string; userId: string; sessionId: string;
  attempts: number; receiptChecks: number; createdAt: number; ticketId: string | null;
  token: string; entityType: string | null; entityId: string | null;
};

const ELIGIBLE = `d.enabled=1 AND d.user_id=p.user_id AND d.session_id=p.session_id
  AND n.recipient_user_id=p.user_id AND u.is_active=1 AND c.notifications_enabled=1
  AND s.user_id=p.user_id AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now')`;
const JOIN = `FROM push_deliveries p JOIN push_devices d ON d.id=p.device_id
  JOIN notifications n ON n.id=p.notification_id JOIN users u ON u.id=p.user_id
  JOIN mobile_credentials c ON c.user_id=p.user_id JOIN mobile_sessions s ON s.id=p.session_id`;

async function claimedRows(db: D1Database, claimId: string, projectId: string): Promise<Delivery[]> {
  const result = await db.prepare(`SELECT p.id,p.notification_id AS notificationId,p.device_id AS deviceId,
    p.user_id AS userId,p.session_id AS sessionId,p.attempts,p.receipt_checks AS receiptChecks,
    p.created_at AS createdAt,p.ticket_id AS ticketId,d.expo_push_token AS token,
    n.entity_type AS entityType,n.entity_id AS entityId
    ${JOIN} WHERE p.claim_id=? AND d.project_id=? AND ${ELIGIBLE}`)
    .bind(claimId, projectId).all<Delivery>();
  return result.results;
}

async function finish(db: D1Database, row: Delivery, claim: string, status: string, now: number, error: string | null = null) {
  await db.prepare(`UPDATE push_deliveries SET status=?,completed_at=?,last_error_code=?,lease_until=NULL,claim_id=NULL
    WHERE id=? AND claim_id=?`).bind(status, now, error, row.id, claim).run();
}

async function retry(db: D1Database, row: Delivery, claim: string, now: number, code: string, receipt = false) {
  if (row.attempts >= MAX_ATTEMPTS || now - row.createdAt >= MAX_AGE_SECONDS) return finish(db, row, claim, 'failed', now, code);
  await db.prepare(`UPDATE push_deliveries SET status=?,available_at=?,last_error_code=?,lease_until=NULL,claim_id=NULL
    WHERE id=? AND claim_id=?`)
    .bind(receipt ? 'ticketed' : 'pending', now + Math.min(3600, 30 * 2 ** Math.min(receipt ? row.receiptChecks : row.attempts, 7)),
      code, row.id, claim).run();
}

async function rejectDelivery(db: D1Database, row: Delivery, claim: string, now: number, code: string) {
  if (code === 'DeviceNotRegistered') {
    // Token rotation/rebinding after this send must not disable the new token.
    await db.prepare('UPDATE push_devices SET enabled=0,updated_at=? WHERE id=? AND user_id=? AND session_id=? AND expo_push_token=?')
      .bind(now, row.deviceId, row.userId, row.sessionId, row.token).run();
  }
  if (code === 'MessageRateExceeded') return retry(db, row, claim, now, code);
  return finish(db, row, claim, 'failed', now, code);
}

async function claim(db: D1Database, now: number, receipt: boolean): Promise<string> {
  const claimId = crypto.randomUUID();
  const statuses = receipt ? "status='ticketed'" : "(status='pending' OR (status='sending' AND lease_until<=?))";
  const values = receipt ? [claimId, now + 60, now, BATCH] : [claimId, now + 60, now, now, BATCH];
  await db.prepare(`UPDATE push_deliveries SET claim_id=?,lease_until=?,
    ${receipt ? 'receipt_checks=receipt_checks+1' : "status='sending',attempts=attempts+1"}
    WHERE id IN (SELECT id FROM push_deliveries WHERE ${statuses}
      AND available_at<=? AND (lease_until IS NULL OR lease_until<=${now}) ORDER BY available_at,id LIMIT ?)`)
    .bind(...values).run();
  return claimId;
}

/** Idempotent 24h reminders; bounded work. Not a scheduler itself. */
async function createDueReminders(db: D1Database, now: number) {
  await db.prepare(`INSERT OR IGNORE INTO notifications(id,recipient_user_id,type,title,body,entity_type,entity_id)
    SELECT 'appointment-reminder:'||a.id||':'||a.starts_at,a.parishioner_user_id,'appointment_reminder',
      'Upcoming appointment','You have an upcoming appointment. Open ParishLink to review its details.','appointment',a.id
    FROM appointments a JOIN mobile_credentials c ON c.user_id=a.parishioner_user_id
    WHERE a.status='approved' AND c.notifications_enabled=1
      AND julianday(a.starts_at)>julianday(?,'unixepoch','+30 minutes')
      AND julianday(a.starts_at)<=julianday(?,'unixepoch','+24 hours')
      AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.id='appointment-reminder:'||a.id||':'||a.starts_at)
    ORDER BY a.starts_at,a.id LIMIT 100`).bind(now, now).run();
}

export async function dispatchPushNotifications(options: {
  db?: D1Database; configuration?: PushConfiguration | null; fetcher?: typeof fetch; now?: number;
} = {}) {
  const config = options.configuration === undefined ? pushConfiguration() : options.configuration;
  if (!config) return { enabled: false, sent: 0, receipts: 0 };
  if (!options.db) await ensurePublicRuntimeDatabase();
  const db = options.db ?? getRawDb();
  const now = Math.floor(options.now ?? Date.now() / 1000);
  await createDueReminders(db, now);
  // Bound cleanup per invocation; unread in-app notifications remain available.
  await db.prepare(`UPDATE push_deliveries SET status='cancelled',completed_at=?,claim_id=NULL,lease_until=NULL
    WHERE id IN (SELECT p.id ${JOIN} WHERE p.status IN ('pending','sending','ticketed')
      AND (p.created_at<? OR NOT (${ELIGIBLE})) LIMIT 100)`).bind(now, now - MAX_AGE_SECONDS).run();

  const sendClaim = await claim(db, now, false);
  const rows = await claimedRows(db, sendClaim, config.projectId);
  for (const row of rows) {
    // Re-read immediately before each external request. A revoked session,
    // preference opt-out or account switch after claiming must prevent sending.
    const stillEligible = await db.prepare(`SELECT p.id ${JOIN} WHERE p.id=? AND p.claim_id=? AND d.project_id=? AND d.expo_push_token=? AND ${ELIGIBLE}`)
      .bind(row.id, sendClaim, config.projectId, row.token).first();
    if (!stillEligible) { await finish(db, row, sendClaim, 'cancelled', now); continue; }
  }
  const eligibleIds = await db.prepare("SELECT id FROM push_deliveries WHERE claim_id=? AND status='sending'").bind(sendClaim).all<{ id: string }>();
  const eligible = new Set(eligibleIds.results.map((item) => item.id));
  const sending = rows.filter((row) => eligible.has(row.id));
  if (sending.length) {
    try {
      const result = await callExpo('send', sending.map((row) => ({
        to: row.token, title: 'ParishLink', body: 'You have a new update. Open ParishLink to view it.',
        sound: 'default', channelId: 'parishlink-updates', ttl: 3600,
        data: { notificationId: row.notificationId, entityType: row.entityType, entityId: row.entityId },
      })), config.accessToken, options.fetcher);
      const tickets = Array.isArray(result.data) ? result.data : [];
      for (let i = 0; i < sending.length; i++) {
        const row = sending[i], ticket = expoResult(tickets[i]);
        if (ticket?.status === 'ok' && ticket.id) {
          await db.prepare(`UPDATE push_deliveries SET status='ticketed',ticket_id=?,available_at=?,claim_id=NULL,lease_until=NULL
            WHERE id=? AND claim_id=?`).bind(ticket.id, now + 900, row.id, sendClaim).run();
        } else if (ticket?.status === 'error') await rejectDelivery(db, row, sendClaim, now, providerErrorCode(ticket));
        else await retry(db, row, sendClaim, now, 'ProviderInvalidResponse');
      }
    } catch (error) {
      const fault = error instanceof PushProviderError ? error : new PushProviderError('ProviderUnavailable', true);
      for (const row of sending) {
        if (fault.retryable) await retry(db, row, sendClaim, now, fault.code);
        else await finish(db, row, sendClaim, 'failed', now, fault.code);
      }
    }
  }
  // Claims whose device/project changed are cancelled, never sent to a new owner.
  await db.prepare("UPDATE push_deliveries SET status='cancelled',completed_at=?,claim_id=NULL,lease_until=NULL WHERE claim_id=?")
    .bind(now, sendClaim).run();

  const receiptClaim = await claim(db, now, true);
  const waiting = await claimedRows(db, receiptClaim, config.projectId);
  if (waiting.length) {
    try {
      const result = await callExpo('receipts', { ids: waiting.map((row) => row.ticketId) }, config.accessToken, options.fetcher);
      const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data as Record<string, unknown> : {};
      for (const row of waiting) {
        const receipt = expoResult(data[row.ticketId ?? '']);
        if (receipt?.status === 'ok') {
          await finish(db, row, receiptClaim, 'delivered', now);
          // "Delivered" here means provider handoff, never proof a person saw it.
          await db.prepare('UPDATE notifications SET push_provider_id=?,delivered_at=datetime(?,\'unixepoch\') WHERE id=? AND delivered_at IS NULL')
            .bind(row.ticketId, now, row.notificationId).run();
        } else if (receipt?.status === 'error') await rejectDelivery(db, row, receiptClaim, now, providerErrorCode(receipt));
        else await retry(db, row, receiptClaim, now, 'ReceiptPending', true);
      }
    } catch (error) {
      const fault = error instanceof PushProviderError ? error : new PushProviderError('ReceiptUnavailable', true);
      for (const row of waiting) {
        if (fault.retryable) await retry(db, row, receiptClaim, now, fault.code, true);
        else await finish(db, row, receiptClaim, 'failed', now, fault.code);
      }
    }
  }
  await db.prepare("UPDATE push_deliveries SET status='cancelled',completed_at=?,claim_id=NULL,lease_until=NULL WHERE claim_id=?")
    .bind(now, receiptClaim).run();
  await db.prepare(`DELETE FROM push_deliveries WHERE id IN (SELECT id FROM push_deliveries
    WHERE status IN ('delivered','failed','cancelled') AND completed_at<? LIMIT 100)`).bind(now - 7 * MAX_AGE_SECONDS).run();
  return { enabled: true, sent: sending.length, receipts: waiting.length };
}
