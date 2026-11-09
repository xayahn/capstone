import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { MobileActor } from '../backend/auth/mobile-auth';

const { env, runtime } = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  runtime: { getRawDb: vi.fn(), ensurePublicRuntimeDatabase: vi.fn(async () => {}) },
}));
vi.mock('cloudflare:workers', () => ({ env, waitUntil: vi.fn() }));
vi.mock('../db/runtime', () => runtime);
import { dispatchPushNotifications, registerPushDevice, unregisterPushDevice } from '../backend/notifications/push-service';
import { callExpo, PushProviderError } from '../backend/notifications/expo-provider';
import { POST as dispatchRoute } from '../backend/routes/system/push-dispatch';
import { requestPushDispatch } from '../jobs/push-scheduler';

const projectId = '12345678-1234-4234-8234-123456789abc';
const installation = 'aaaaaaaa-1234-4234-8234-123456789abc';
const otherInstallation = 'bbbbbbbb-1234-4234-8234-123456789abc';
const token = 'ExponentPushToken[test_token_123456789]';
const actor = (id = 'u1', sessionId = 's1'): MobileActor => ({
  id, sessionId, displayName: id, email: `${id}@example.test`, mobileNumber: '+639170000001',
  homeParishId: 'p1', notificationsEnabled: true,
});
let sql: DatabaseSync;
let db: D1Database;
let now: number;

function adapter(database: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      let values: Array<string | number | null> = [];
      const statement = {
        bind(...args: Array<string | number | null>) { values = args; return statement; },
        async first() { return database.prepare(query).get(...values) ?? null; },
        async all() { return { success: true, results: database.prepare(query).all(...values), meta: {} }; },
        async run() { return statement.syncRun(); },
        syncRun() { const result = database.prepare(query).run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
      };
      return statement;
    },
    async batch(statements: Array<{ syncRun(): unknown }>) {
      database.exec('BEGIN');
      try { const result = statements.map((statement) => statement.syncRun()); database.exec('COMMIT'); return result; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
}

const register = (user = actor(), installationId = installation, expoPushToken = token) =>
  registerPushDevice(user, { installationId, expoPushToken, platform: 'android', projectId });
function notify(id = 'n1', recipient = 'u1') {
  sql.prepare(`INSERT INTO notifications(id,recipient_user_id,type,title,body,entity_type,entity_id)
    VALUES(?,?,'document','PRIVATE CHILD NAME','PRIVATE DOCUMENT DETAILS','appointment','appointment-1')`).run(id, recipient);
}
const sendOk = () => vi.fn<typeof fetch>(async () => Response.json({ data: [{ status: 'ok', id: 'ticket-1' }] }));
const dispatch = (fetcher: typeof fetch, at = now) => dispatchPushNotifications({ db, fetcher, now: at });

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  env.PUSH_NOTIFICATIONS_ENABLED = 'true'; env.EXPO_PROJECT_ID = projectId;
  sql = new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON');
  const folder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  for (const file of readdirSync(folder).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    sql.exec(readFileSync(resolve(folder, file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  }
  sql.exec("INSERT INTO parishes(id,slug,name)VALUES('p1','p1','Test parish')");
  for (const [id, session] of [['u1', 's1'], ['u2', 's2']]) {
    sql.prepare("INSERT INTO users(id,email,full_name,role,home_parish_id)VALUES(?,?,?,'parishioner','p1')").run(id, id+'@example.test', id);
    sql.prepare("INSERT INTO mobile_credentials(user_id,password_hash,password_salt)VALUES(?,'hash','salt')").run(id);
    sql.prepare("INSERT INTO mobile_sessions(id,user_id,token_hash,expires_at)VALUES(?,?,?,datetime('now','+1 day'))").run(session,id,session+'-token');
  }
  db = adapter(sql); runtime.getRawDb.mockReturnValue(db);
  now = Math.floor(Date.now()/1000);
});
afterEach(() => { sql.close(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('durable session-bound Expo push pipeline', () => {
  it('does not replay historical notifications and atomically enqueues new notifications once', async () => {
    notify('historical');
    await register(); await register();
    expect(sql.prepare('SELECT count(*) AS n FROM push_deliveries').get()?.n).toBe(0);
    notify();
    expect(sql.prepare('SELECT count(*) AS n FROM push_deliveries').get()?.n).toBe(1);
  });
  it('sends generic lock-screen content and only marks provider handoff after a receipt', async () => {
    await register(); notify();
    const fetcher = sendOk();
    await dispatch(fetcher);
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload).toEqual([expect.objectContaining({
      title: 'ParishLink', channelId: 'parishlink-updates',
      data: { notificationId: 'n1', entityType: 'appointment', entityId: 'appointment-1' },
    })]);
    expect(JSON.stringify(payload)).not.toMatch(/PRIVATE|CHILD|DOCUMENT DETAILS/);
    expect(sql.prepare("SELECT status FROM push_deliveries").get()?.status).toBe('ticketed');
    expect(sql.prepare('SELECT delivered_at FROM notifications').get()?.delivered_at).toBeNull();
    const receipt = vi.fn<typeof fetch>(async () => Response.json({ data: { 'ticket-1': { status: 'ok' } } }));
    await dispatch(receipt, now+901);
    expect(receipt.mock.calls[0][0]).toBe('https://exp.host/--/api/v2/push/getReceipts');
    expect(sql.prepare("SELECT status FROM push_deliveries").get()?.status).toBe('delivered');
    expect(sql.prepare('SELECT delivered_at FROM notifications').get()?.delivered_at).toBeTruthy();
  });
  it('does not enqueue opted-out notifications', async () => {
    await register();
    sql.exec("UPDATE mobile_credentials SET notifications_enabled=0 WHERE user_id='u1'");
    notify();
    expect(sql.prepare('SELECT count(*) AS n FROM push_deliveries').get()?.n).toBe(0);
  });
  it.each(['revoked', 'expired', 'opted-out', 'inactive'])('cancels pending delivery after the account is %s', async (change) => {
    await register(); notify();
    if (change==='revoked') sql.exec("UPDATE mobile_sessions SET revoked_at=datetime('now') WHERE id='s1'");
    if (change==='expired') sql.exec("UPDATE mobile_sessions SET expires_at=datetime('now','-1 hour') WHERE id='s1'");
    if (change==='opted-out') sql.exec("UPDATE mobile_credentials SET notifications_enabled=0 WHERE user_id='u1'");
    if (change==='inactive') sql.exec("UPDATE users SET is_active=0 WHERE id='u1'");
    const fetcher = sendOk();
    await dispatch(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(sql.prepare('SELECT status FROM push_deliveries').get()?.status).toBe('cancelled');
  });
  it('rebinds the same installation on account switch without sending the old owner notifications', async () => {
    await register(); notify('old');
    await register(actor('u2','s2'));
    await unregisterPushDevice(actor(), { installationId: installation });
    notify('new', 'u2');
    const fetcher = sendOk(); await dispatch(fetcher);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))[0].data.notificationId).toBe('new');
    expect(sql.prepare("SELECT status FROM push_deliveries WHERE notification_id='old'").get()?.status).toBe('cancelled');
  });
  it('does not let a token alone take over another installation', async () => {
    await register();
    await expect(register(actor('u2','s2'), otherInstallation)).rejects.toMatchObject({ status: 409 });
    expect(sql.prepare('SELECT user_id FROM push_devices').get()?.user_id).toBe('u1');
  });
  it('rejects a delayed older-session rebind after a newer account registered', async () => {
    sql.exec("UPDATE mobile_sessions SET created_at=datetime('now','-1 hour') WHERE id='s1'");
    await register();
    await register(actor('u2','s2'));
    await expect(register()).rejects.toMatchObject({ status: 409 });
    expect(sql.prepare('SELECT user_id FROM push_devices').get()?.user_id).toBe('u2');
  });
  it('uses session insertion order when creation timestamps tie', async () => {
    sql.exec("UPDATE mobile_sessions SET created_at='2026-11-05 12:00:00'");
    await register();
    await register(actor('u2','s2'));
    await expect(register()).rejects.toMatchObject({ status: 409 });
    expect(sql.prepare('SELECT user_id,session_id FROM push_devices').get()).toMatchObject({ user_id: 'u2', session_id: 's2' });
    await expect(register(actor('u2','s2'))).resolves.toEqual({ registered: true });
  });
  it('rechecks the session at registration write time after route authentication', async () => {
    sql.exec("UPDATE mobile_sessions SET revoked_at=datetime('now') WHERE id='s1'");
    await expect(register()).rejects.toMatchObject({ status: 401 });
    expect(sql.prepare('SELECT count(*) AS n FROM push_devices').get()?.n).toBe(0);
  });
  it('allows login session pruning to delete a session with registered devices and pending deliveries', async () => {
    await register(); notify();
    sql.exec("DELETE FROM mobile_sessions WHERE id='s1'");
    expect(sql.prepare('SELECT count(*) AS n FROM push_devices').get()?.n).toBe(0);
    expect(sql.prepare('SELECT count(*) AS n FROM push_deliveries').get()?.n).toBe(0);
    expect(sql.prepare('SELECT count(*) AS n FROM notifications').get()?.n).toBe(1);
  });
  it('ignores forged recipients and only registers the authenticated actor', async () => {
    await registerPushDevice(actor(), { installationId: installation, expoPushToken: token, platform: 'ios', projectId, userId: 'u2', sessionId: 's2' });
    expect(sql.prepare('SELECT user_id,session_id FROM push_devices').get()).toMatchObject({ user_id: 'u1', session_id: 's1' });
  });
  it('rejects invalid tokens, project mismatches and disabled configuration', async () => {
    await expect(register(actor(), installation, 'not-an-expo-token')).rejects.toMatchObject({ status: 400 });
    await expect(registerPushDevice(actor(), { installationId: installation, expoPushToken: token, platform: 'android', projectId: otherInstallation })).rejects.toMatchObject({ status: 400 });
    env.PUSH_NOTIFICATIONS_ENABLED = 'false';
    await expect(register()).rejects.toMatchObject({ status: 503 });
    expect((await dispatch(sendOk())).enabled).toBe(false);
  });
  it('disables DeviceNotRegistered tokens and stops sending to them', async () => {
    await register(); notify();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }));
    await dispatch(fetcher);
    expect(sql.prepare('SELECT enabled FROM push_devices').get()?.enabled).toBe(0);
    expect(sql.prepare('SELECT status FROM push_deliveries').get()?.status).toBe('failed');
    notify('n2');
    expect(sql.prepare('SELECT count(*) AS n FROM push_deliveries').get()?.n).toBe(1);
  });
  it('retains transient failures for a later bounded retry', async () => {
    await register(); notify();
    const fetcher = vi.fn<typeof fetch>(async () => { throw new TypeError('offline'); });
    await dispatch(fetcher); await dispatch(fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(sql.prepare('SELECT status,attempts FROM push_deliveries').get()).toMatchObject({ status: 'pending', attempts: 1 });
    const good = sendOk(); await dispatch(good, now+61);
    expect(good).toHaveBeenCalledOnce();
  });
  it('leases concurrent dispatchers so only one sends the same delivery', async () => {
    await register(); notify();
    const fetcher = sendOk();
    await Promise.all([dispatch(fetcher), dispatch(fetcher)]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('generates one reminder for an approved upcoming appointment, without historical replay', async () => {
    await register();
    sql.exec("INSERT INTO service_types(id,slug,name,duration_minutes)VALUES('svc','svc','Test',60)");
    sql.prepare(`INSERT INTO appointments(id,reference,parishioner_user_id,parishioner_name,service_type_id,parish_id,starts_at,ends_at,status)
      VALUES('a1','A1','u1','Private','svc','p1',datetime(?,'unixepoch','+12 hours'),datetime(?,'unixepoch','+13 hours'),'approved')`).run(now,now);
    await dispatch(sendOk()); await dispatch(sendOk());
    expect(sql.prepare("SELECT count(*) AS n FROM notifications WHERE type='appointment_reminder'").get()?.n).toBe(1);
    expect(sql.prepare('SELECT count(*) AS n FROM push_deliveries').get()?.n).toBe(1);
  });
});

describe('push provider and scheduler boundaries', () => {
  it.each([301, 302, 303, 307, 308])('uses Workers-compatible manual redirects and rejects provider status %s permanently', async (status) => {
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ cancel }), {
      status, headers: { Location: 'https://untrusted.example/collect' },
    }));
    await expect(callExpo('send', [], 'synthetic-provider-token', fetcher))
      .rejects.toMatchObject({ code: 'ProviderRedirectRejected', retryable: false });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('https://exp.host/--/api/v2/push/send');
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(['redirected', 'opaqueredirect'])('rejects a provider response marked %s before reading its body', async (kind) => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }));
    Object.defineProperty(response, kind === 'redirected' ? 'redirected' : 'type', {
      value: kind === 'redirected' ? true : 'opaqueredirect',
    });
    await expect(callExpo('receipts', { ids: [] }, undefined, vi.fn(async () => response)))
      .rejects.toMatchObject({ code: 'ProviderRedirectRejected', retryable: false });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('does not repeatedly retry a permanent provider redirect', async () => {
    await register(); notify();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 307, headers: { Location: 'https://untrusted.example/collect' },
    }));
    await dispatch(fetcher); await dispatch(fetcher, now+61);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(sql.prepare('SELECT status,last_error_code FROM push_deliveries').get())
      .toMatchObject({ status: 'failed', last_error_code: 'ProviderRedirectRejected' });
  });
  it('does not repeatedly retry a permanent receipt endpoint redirect', async () => {
    await register(); notify();
    await dispatch(sendOk());
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 302, headers: { Location: 'https://untrusted.example/collect' },
    }));
    await dispatch(fetcher, now+901); await dispatch(fetcher, now+1800);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(sql.prepare('SELECT status,last_error_code FROM push_deliveries').get())
      .toMatchObject({ status: 'failed', last_error_code: 'ProviderRedirectRejected' });
  });
  it('times out a stalled provider body and cancels it', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ cancel })));
    const pending = callExpo('send', [], undefined, fetcher);
    const rejection = expect(pending).rejects.toMatchObject({ code: 'ProviderTimeout' });
    await vi.advanceTimersByTimeAsync(8_001); await rejection;
    expect(cancel).toHaveBeenCalled();
  });
  it('bounds provider response sizes and classifies rate limits for retry', async () => {
    await expect(callExpo('send', [], undefined, vi.fn(async () => new Response('x'.repeat(64_001))))).rejects.toBeInstanceOf(PushProviderError);
    await expect(callExpo('send', [], undefined, vi.fn(async () => new Response('', { status: 429 })))).rejects.toMatchObject({ retryable: true });
  });
  it('requires a separate strong scheduler secret and accepts no user bearer token', async () => {
    let response = await dispatchRoute(new Request('https://api.example/api/internal/notifications/dispatch', { method: 'POST' }));
    expect(response.status).toBe(503);
    env.PUSH_DISPATCH_SECRET = 'x'.repeat(48);
    response = await dispatchRoute(new Request('https://api.example/api/internal/notifications/dispatch', { method: 'POST', headers: { Authorization: 'Bearer user-token' } }));
    expect(response.status).toBe(401);
    env.PUSH_NOTIFICATIONS_ENABLED = 'false';
    response = await dispatchRoute(new Request('https://api.example/api/internal/notifications/dispatch', { method: 'POST', headers: { Authorization: 'Bearer '+'x'.repeat(48) } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false, sent: 0, receipts: 0 });
  });
  it('does not follow scheduler redirects or allow credentials in its configured URL', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    await requestPushDispatch({ PUSH_DISPATCH_URL: 'https://api.example/api/internal/notifications/dispatch', PUSH_DISPATCH_SECRET: 'x'.repeat(48) }, fetcher);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
    await expect(requestPushDispatch({ PUSH_DISPATCH_URL: 'https://user:password@api.example/api/internal/notifications/dispatch', PUSH_DISPATCH_SECRET: 'x'.repeat(48) }, fetcher)).rejects.toThrow();
  });
  it.each([301, 302, 303, 307, 308])('rejects scheduler redirect status %s without forwarding service credentials', async (status) => {
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ cancel }), {
      status, headers: { Location: 'https://untrusted.example/collect' },
    }));
    await expect(requestPushDispatch({
      PUSH_DISPATCH_URL: 'https://api.example/api/internal/notifications/dispatch',
      PUSH_DISPATCH_SECRET: 'x'.repeat(48), SITES_SERVICE_ACCESS_TOKEN: 'synthetic-service-token',
    }, fetcher)).rejects.toThrow('unexpected redirect');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('https://api.example/api/internal/notifications/dispatch');
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(['redirected', 'opaqueredirect'])('rejects scheduler response marked %s even with a successful status', async (kind) => {
    const response = new Response(null);
    Object.defineProperty(response, kind === 'redirected' ? 'redirected' : 'type', {
      value: kind === 'redirected' ? true : 'opaqueredirect',
    });
    await expect(requestPushDispatch({
      PUSH_DISPATCH_URL: 'https://api.example/api/internal/notifications/dispatch', PUSH_DISPATCH_SECRET: 'x'.repeat(48),
    }, vi.fn(async () => response))).rejects.toThrow('unexpected redirect');
  });
});
