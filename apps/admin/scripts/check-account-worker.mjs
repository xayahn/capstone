import assert from 'node:assert/strict';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This is an isolated source-route regression runner, never a deployable server.
// It reads no .env/.dev.vars and uses no provider credentials or persistent DB.
// Auth/CORS/body/error/rate-limit/mail/push source is executed by real workerd.
// Only DB access/bootstrap is replaced with an explicitly migrated test D1;
// the small router below is test-owned, not Vinext/framework acceptance.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'package.json'));
const ts = require('typescript');
const wranglerRequire = createRequire(realpathSync(require.resolve('wrangler/package.json')));
const { Miniflare, Log, LogLevel } = wranglerRequire('miniflare');
const origin = 'https://mobile.example.test';
const routes = {
  'sign-up': ['POST', 'sign-up'],
  'sign-in': ['POST', 'sign-in'],
  session: ['GET', 'session'],
  'sign-out': ['POST', 'sign-out'],
  'change-password': ['POST', 'change-password'],
  'password-reset/request': ['POST', 'password-reset-request'],
  'password-reset/confirm': ['POST', 'password-reset-confirm'],
  'email-verification/request': ['POST', 'email-verification-request'],
  'email-verification/confirm': ['POST', 'email-verification-confirm'],
};
const paths = [
  'backend/auth/mobile-auth.ts', 'backend/auth/account-recovery.ts', 'backend/auth/account-mailer.ts',
  'backend/security/mobile-rate-limit.ts', 'backend/http/mobile-http.ts', 'backend/http/small-json.ts',
  'backend/config/runtime-config.ts', 'backend/observability/server-log.ts', 'shared/validation.ts',
  'backend/notifications/background-dispatch.ts', 'backend/notifications/push-service.ts',
  'backend/notifications/expo-provider.ts',
  ...Object.values(routes).map(([, file]) => `backend/routes/mobile/auth/${file}.ts`),
];
const moduleName = file => file.replace(/\.ts$/, '.mjs');
const aliases = new Map(paths.map(file => ['@/' + file.replace(/\.ts$/, ''), moduleName(file)]));
aliases.set('@/db/runtime', 'account-probe-runtime.mjs');
function compile(file) {
  const result = ts.transpileModule(readFileSync(resolve(root, file), 'utf8'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(result.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error), false, 'Account source must transpile before the Worker check.');
  return result.outputText.replace(/(['"])@\/([^'"]+)\1/g, (_, quote, specifier) => {
    const target = aliases.get('@/' + specifier);
    assert.ok(target, 'Every source dependency must be explicitly included in the isolated Worker.');
    const specifierPath = relative(dirname(moduleName(file)), target).replaceAll('\\', '/');
    return quote + (specifierPath.startsWith('.') ? specifierPath : './' + specifierPath) + quote;
  });
}
const modules = [
  { type: 'ESModule', path: resolve(root, 'account-probe-entry.mjs'), contents: `
    ${Object.values(routes).map(([, file], index) => `import * as route${index} from './backend/routes/mobile/auth/${file}.mjs';`).join('\n')}
    const routes = new Map([
      ${Object.entries(routes).map(([path, [method]], index) => `['/api/mobile/auth/${path}', { method: '${method}', module: route${index} }]`).join(',\n')}
    ]);
    export default { async fetch(request) {
      const match = routes.get(new URL(request.url).pathname);
      if (!match) return new Response(null, {status:404});
      if (request.method === 'OPTIONS') return match.module.OPTIONS(request);
      if (request.method !== match.method) return new Response(null, {status:405});
      return match.module[match.method](request);
    } };
  ` },
  { type: 'ESModule', path: resolve(root, 'account-probe-runtime.mjs'), contents: "import {env} from 'cloudflare:workers'; export const getRawDb=()=>env.DB; export const ensurePublicRuntimeDatabase=async()=>{};" },
  ...paths.map(file => ({ type: 'ESModule', path: resolve(root, moduleName(file)), contents: compile(file) })),
];
const configuration = {
  NODE_ENV: 'production', MOBILE_ALLOWED_ORIGINS: origin, PUSH_NOTIFICATIONS_ENABLED: 'false',
  MAIL_ENABLED: 'true', MAIL_DELIVERY_VERIFIED: 'true',
  RESEND_API_KEY: 're_synthetic_worker_probe_not_a_real_key', MAIL_FROM: 'noreply@example.test',
};
const checks = [];
let stage = 'startup';
class ProbeFailure extends Error {
  constructor(code, label, status) { super(label); this.name = 'ProbeFailure'; this.code = code; this.status = status; }
}
function check(name, pass) {
  stage = name;
  checks.push({ name, pass: Boolean(pass) });
  if (!pass) throw new ProbeFailure('ASSERTION_FAILED', name);
}
async function bounded(work, label, milliseconds = 10_000) {
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new ProbeFailure('TIMEOUT', label)), milliseconds); })]);
  } finally { clearTimeout(timer); }
}
const messages = []; // Transient synthetic codes only. Never logged or written.
const releases = new Set();
let holdNext = false;
let rejectNext = false;
let redirectNext = false;
let providerAttempts = 0;
let unexpectedOutbound = 0;
let transportValid = true;
async function interceptedEmail(request) {
  if (request.url !== 'https://api.resend.com/emails') {
    unexpectedOutbound++;
    return new Response('External transport disabled in the account check.', { status: 502 });
  }
  providerAttempts++;
  let payload;
  try { payload = await request.json(); } catch { transportValid = false; return new Response(null, { status: 400 }); }
  const purpose = payload.subject === 'Verify your ParishLink email' ? 'email_verification'
    : payload.subject === 'Reset your ParishLink password' ? 'password_reset' : null;
  const code = typeof payload.text === 'string' ? payload.text.match(/code is ([A-HJ-NP-Z2-9-]+)\./)?.[1] : null;
  const email = payload.to?.[0];
  const valid = request.method === 'POST' && purpose && typeof email === 'string' && /^worker-[a-z]+@example\.test$/.test(email)
    && typeof code === 'string' && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)
    && payload.from === configuration.MAIL_FROM;
  if (!valid) { transportValid = false; return new Response(null, { status: 400 }); }
  messages.push({ email, purpose, code });
  if (holdNext) {
    holdNext = false;
    await new Promise(resolve => { releases.add(resolve); });
  }
  if (rejectNext) { rejectNext = false; return new Response(null, { status: 503 }); }
  if (redirectNext) { redirectNext = false; return new Response(null, { status: 302, headers: { Location: 'https://redirect.invalid' } }); }
  return Response.json({ id: 'synthetic-worker-accepted' });
}
function createWorker(enabled = true) {
  return new Miniflare({
    compatibilityDate: '2026-07-30', compatibilityFlags: ['nodejs_compat'],
    host: '127.0.0.1', port: 0, log: new Log(LogLevel.NONE), modulesRoot: root,
    bindings: { ...configuration, MAIL_ENABLED: enabled ? 'true' : 'false' },
    d1Databases: ['DB'], modules, outboundService: interceptedEmail,
  });
}
async function api(worker, path, { method = 'POST', token, body, raw, headers = {} } = {}) {
  const response = await bounded(worker.dispatchFetch(`https://account-probe.local/api/mobile/auth/${path}`, {
    method, headers: {
      Origin: origin, Accept: 'application/json', 'cf-connecting-ip': '192.0.2.10',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers,
    },
    ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), 'HTTP route ' + path);
  const text = await bounded(response.text(), 'Read HTTP route ' + path);
  let payload;
  try { payload = text ? JSON.parse(text) : undefined; } catch { payload = undefined; }
  return { status: response.status, headers: response.headers, payload };
}
async function until(work, label, milliseconds = 5000) {
  const end = performance.now() + milliseconds;
  while (performance.now() < end) {
    if (await bounded(work(), label)) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new ProbeFailure('TIMEOUT', label);
}
const lastCode = (email, purpose) => [...messages].reverse().find(item => item.email === email && item.purpose === purpose)?.code;
const passwords = { original: 'SyntheticOriginal123', changed: 'SyntheticChanged456', reset: 'SyntheticRecovered789' };
const workers = [];

async function run() {
  const worker = createWorker(); workers.push(worker);
  const db = await bounded(worker.getD1Database('DB'), 'Get isolated D1');
  stage = 'Apply isolated append-only migrations';
  const migrations = readdirSync(resolve(root, 'drizzle')).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
  for (const file of migrations) {
    for (const piece of readFileSync(resolve(root, 'drizzle', file), 'utf8').split('--> statement-breakpoint')) {
      const statement = piece.trim();
      if (statement && !/^PRAGMA foreign_keys/i.test(statement)) await bounded(db.prepare(statement).run(), 'Apply isolated migration');
    }
  }
  check('All eight append-only migrations execute on actual workerd D1', migrations.length === 8);
  await bounded(db.prepare("INSERT INTO parishes(id,slug,name)VALUES('probe-parish','probe-parish','Synthetic Worker Parish')").run(), 'Seed synthetic parish');
  const accounts = new Map();
  async function signup(name) {
    const email = `worker-${name}@example.test`;
    const result = await api(worker, 'sign-up', { body: { displayName: 'Synthetic Worker Tester', email,
      mobileNumber: '+639170000001', homeParishId: 'probe-parish', password: passwords.original,
      confirmPassword: passwords.original, acceptPrivacyNotice: true } });
    if (result.status !== 201 || typeof result.payload?.accessToken !== 'string') throw new ProbeFailure('FIXTURE_FAILED', 'Synthetic signup', result.status);
    const value = { email, userId: result.payload.profile.id, token: result.payload.accessToken };
    accounts.set(name, value); return value;
  }
  async function signin(account, password = passwords.original) {
    return api(worker, 'sign-in', { body: { email: account.email, password } });
  }
  const session = token => api(worker, 'session', { method: 'GET', token });
  const resetInput = (email, code, password = passwords.reset) => ({ email, code, newPassword: password, confirmPassword: password });
  async function issue(account, purpose = 'password_reset') {
    const before = messages.length;
    const response = await api(worker, purpose === 'password_reset' ? 'password-reset/request' : 'email-verification/request', {
      ...(purpose === 'email_verification' ? { token: account.token, body: {} } : { body: { email: account.email } }),
    });
    if (response.status !== 202) throw new ProbeFailure('FIXTURE_FAILED', 'Synthetic challenge request', response.status);
    await until(async () => messages.length > before && Boolean(await db.prepare("SELECT id FROM mobile_email_challenges WHERE user_id=? AND purpose=? AND delivery_status='ready'").bind(account.userId, purpose).first()), 'Challenge delivery activation');
    return lastCode(account.email, purpose);
  }

  const a = await signup('lifecycle');
  check('Source sign-up route creates an unverified account and protected session', (await session(a.token)).payload?.profile?.emailVerified === false);
  const duplicate = await api(worker, 'sign-up', { body: { displayName: 'Synthetic Worker Tester', email: a.email, mobileNumber: '+639170000001', homeParishId: 'probe-parish', password: passwords.original, confirmPassword: passwords.original, acceptPrivacyNotice: true } });
  check('Duplicate signup is a controlled conflict', duplicate.status === 409 && typeof duplicate.payload?.error === 'string');
  const second = await signin(a);
  check('Source sign-in route accepts the valid password', second.status === 200 && typeof second.payload?.accessToken === 'string');
  const secondToken = second.payload.accessToken;
  const invalidSignIn = await signin(a, 'SyntheticWrongPassword123');
  check('Invalid sign-in is rejected without a session', invalidSignIn.status === 401 && !invalidSignIn.payload?.accessToken);
  check('Unauthenticated session read is rejected', (await session()).status === 401);
  const cors = await api(worker, 'password-reset/request', { body: { email: a.email }, headers: { Origin: 'https://untrusted.example.test' } });
  check('Actual mobile CORS helper rejects an unapproved browser origin', cors.status === 403 && !cors.headers.has('Access-Control-Allow-Origin'));
  const preflight = await api(worker, 'password-reset/request', { method: 'OPTIONS' });
  check('Allowed preflight is scoped and does not enable wildcard origins', preflight.status === 204 && preflight.headers.get('Access-Control-Allow-Origin') === origin);
  const malformed = await api(worker, 'password-reset/request', { raw: '{broken' });
  const large = await api(worker, 'password-reset/request', { body: { email: a.email, padding: 'x'.repeat(2100) } });
  const wrongType = await api(worker, 'password-reset/request', { raw: '{}', headers: { 'Content-Type': 'text/plain' } });
  check('Actual body reader rejects malformed, oversized and non-JSON requests', malformed.status === 400 && large.status === 413 && wrongType.status === 415);

  const b = await signup('verification');
  const bOther = await signin(b);
  const verifyCode = await issue(b, 'email_verification');
  const otherConfirm = await api(worker, 'email-verification/confirm', { token: bOther.payload.accessToken, body: { code: verifyCode } });
  check('Verification code is bound to the requesting session', otherConfirm.status === 400 && (await session(b.token)).payload?.profile?.emailVerified === false);
  const verify = await api(worker, 'email-verification/confirm', { token: b.token, body: { code: verifyCode } });
  check('Correct current-session verification produces authoritative proof', verify.status === 200 && verify.payload?.emailVerified === true && (await session(bOther.payload.accessToken)).payload?.profile?.emailVerified === true);
  check('Verification code reuse is rejected', (await api(worker, 'email-verification/confirm', { token: b.token, body: { code: verifyCode } })).status === 400);
  const logout = await api(worker, 'sign-out', { token: b.token });
  check('Online sign-out revokes the server session', logout.status === 204 && (await session(b.token)).status === 401);
  check('Signing out one session leaves another valid session intact', (await session(bOther.payload.accessToken)).status === 200);

  const staleCode = await issue(a);
  await issue(a, 'email_verification');
  const changed = await api(worker, 'change-password', { token: a.token, body: { currentPassword: passwords.original, newPassword: passwords.changed, confirmPassword: passwords.changed } });
  check('Password change succeeds with D1 trigger-inclusive change counts', changed.status === 204);
  check('Password change retains the initiating session and revokes other sessions', (await session(a.token)).status === 200 && (await session(secondToken)).status === 401);
  check('Password change invalidates both challenge purposes', Number((await db.prepare('SELECT count(*) AS n FROM mobile_email_challenges WHERE user_id=?').bind(a.userId).first()).n) === 0);
  check('An invalidated reset code cannot change the new password', (await api(worker, 'password-reset/confirm', { body: resetInput(a.email, staleCode) })).status === 400);
  const oldPassword = await signin(a);
  const newPassword = await signin(a, passwords.changed);
  check('Only the changed password works after authenticated change', oldPassword.status === 401 && newPassword.status === 200);
  const thirdToken = newPassword.payload.accessToken;
  const activeSession = await db.prepare('SELECT id FROM mobile_sessions WHERE user_id=? AND revoked_at IS NULL LIMIT 1').bind(a.userId).first();
  await db.prepare("INSERT INTO push_devices(id,user_id,session_id,expo_push_token,platform,project_id)VALUES('probe-device',?,?,'ExpoPushToken[synthetic_worker_probe]','android','synthetic-project')").bind(a.userId, activeSession.id).run();

  const messageCount = messages.length;
  holdNext = true;
  const accepted = await api(worker, 'password-reset/request', { body: { email: a.email } });
  check('Reset acknowledgement returns before blocked provider completion', accepted.status === 202 && accepted.payload?.accepted === true);
  await until(async () => messages.length > messageCount, 'Intercepted blocked transport');
  const resetCode = lastCode(a.email, 'password_reset');
  const pending = await db.prepare("SELECT delivery_status,code_hash FROM mobile_email_challenges WHERE user_id=? AND purpose='password_reset'").bind(a.userId).first();
  check('Code remains hashed and unusable before provider acceptance', pending?.delivery_status === 'pending' && /^[a-f0-9]{64}$/.test(pending?.code_hash ?? '') && !JSON.stringify(accepted.payload).includes(resetCode));
  check('Pending reset code is rejected', (await api(worker, 'password-reset/confirm', { body: resetInput(a.email, resetCode) })).status === 400);
  const unknown = await api(worker, 'password-reset/request', { body: { email: 'worker-unknown@example.test' } });
  check('Known and unknown reset requests have identical public acknowledgements', unknown.status === accepted.status && JSON.stringify(unknown.payload) === JSON.stringify(accepted.payload));
  for (const release of releases) release(); releases.clear();
  await until(async () => (await db.prepare("SELECT delivery_status FROM mobile_email_challenges WHERE user_id=? AND purpose='password_reset'").bind(a.userId).first())?.delivery_status === 'ready', 'Actual workers.waitUntil completion');
  check('Actual workers.waitUntil activates delivery after the HTTP response', true);
  const reset = await api(worker, 'password-reset/confirm', { body: resetInput(a.email, resetCode) });
  check('Valid reset returns empty success without automatic login', reset.status === 204 && reset.payload === undefined);
  check('Reset revokes every prior bearer session', (await session(a.token)).status === 401 && (await session(thirdToken)).status === 401);
  check('Reset removes push bindings and consumes challenges', Number((await db.prepare('SELECT count(*) AS n FROM push_devices WHERE user_id=?').bind(a.userId).first()).n) === 0 && Number((await db.prepare('SELECT count(*) AS n FROM mobile_email_challenges WHERE user_id=?').bind(a.userId).first()).n) === 0);
  check('Reset code reuse is rejected', (await api(worker, 'password-reset/confirm', { body: resetInput(a.email, resetCode) })).status === 400);
  const beforeReset = await signin(a, passwords.changed);
  const afterReset = await signin(a, passwords.reset);
  check('Manual sign-in uses only the reset password and shows proven email', beforeReset.status === 401 && afterReset.status === 200 && afterReset.payload?.profile?.emailVerified === true);

  const c = await signup('concurrency');
  const concurrentCode = await issue(c);
  const simultaneous = await Promise.all([api(worker, 'password-reset/confirm', { body: resetInput(c.email, concurrentCode) }), api(worker, 'password-reset/confirm', { body: resetInput(c.email, concurrentCode) })]);
  check('Concurrent correct reset redemption has exactly one winner', simultaneous.filter(item => item.status === 204).length === 1 && simultaneous.filter(item => item.status === 400).length === 1);
  const d = await signup('expiry');
  const lockedCode = await issue(d);
  const wrongCode = lockedCode.replace(/^[A-HJ-NP-Z2-9]/, value => value === 'A' ? 'B' : 'A');
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await api(worker, 'password-reset/confirm', { body: resetInput(d.email, wrongCode) })).status !== 400) throw new ProbeFailure('ASSERTION_FAILED', 'Wrong code rejection');
  }
  check('Five wrong attempts invalidate only the challenge', (await api(worker, 'password-reset/confirm', { body: resetInput(d.email, lockedCode) })).status === 400 && (await signin(d)).status === 200);
  const expiredCode = await issue(d);
  await db.prepare("UPDATE mobile_email_challenges SET expires_at=unixepoch() WHERE user_id=? AND purpose='password_reset'").bind(d.userId).run();
  check('Integer expiry boundary rejects an otherwise correct code', (await api(worker, 'password-reset/confirm', { body: resetInput(d.email, expiredCode) })).status === 400);
  const e = await signup('failure');
  rejectNext = true;
  const failureIndex = messages.length;
  const failedDelivery = await api(worker, 'password-reset/request', { body: { email: e.email } });
  await until(async () => messages.length > failureIndex && Number((await db.prepare('SELECT count(*) AS n FROM mobile_email_challenges WHERE user_id=?').bind(e.userId).first()).n) === 0, 'Rejected delivery cleanup');
  check('Provider rejection preserves generic acknowledgement and deletes the unusable challenge', failedDelivery.status === 202 && (await api(worker, 'password-reset/confirm', { body: resetInput(e.email, lastCode(e.email, 'password_reset')) })).status === 400);
  redirectNext = true;
  const redirectIndex = messages.length;
  await api(worker, 'password-reset/request', { body: { email: e.email } });
  await until(async () => messages.length > redirectIndex && Number((await db.prepare('SELECT count(*) AS n FROM mobile_email_challenges WHERE user_id=?').bind(e.userId).first()).n) === 0, 'Redirected delivery cleanup');
  check('Provider redirect is rejected without a follow-up request', unexpectedOutbound === 0 && (await api(worker, 'password-reset/confirm', { body: resetInput(e.email, lastCode(e.email, 'password_reset')) })).status === 400);
  const f = await signup('replacement');
  const firstCode = await issue(f); const latestCode = await issue(f);
  check('Only the latest requested reset code works', firstCode !== latestCode && (await api(worker, 'password-reset/confirm', { body: resetInput(f.email, firstCode) })).status === 400 && (await api(worker, 'password-reset/confirm', { body: resetInput(f.email, latestCode) })).status === 204);
  for (let attempt = 0; attempt < 3; attempt++) await api(worker, 'password-reset/request', { body: { email: 'worker-ratelimit@example.test' } });
  check('Unknown-email request limits are enforced without disclosing account existence', (await api(worker, 'password-reset/request', { body: { email: 'worker-ratelimit@example.test' } })).status === 429);

  const unavailable = createWorker(false); workers.push(unavailable);
  const unavailableKnown = await api(unavailable, 'password-reset/request', { body: { email: a.email } });
  const unavailableUnknown = await api(unavailable, 'password-reset/request', { body: { email: 'worker-absent@example.test' } });
  check('Disabled mail fails closed identically for every email', unavailableKnown.status === 503 && unavailableUnknown.status === 503 && JSON.stringify(unavailableKnown.payload) === JSON.stringify(unavailableUnknown.payload));
  check('Responses carry no-store and scoped browser headers', accepted.headers.get('Cache-Control')?.includes('no-store') && accepted.headers.get('Access-Control-Allow-Origin') === origin && accepted.headers.get('X-Content-Type-Options') === 'nosniff');
  check('All transport stayed intercepted with valid synthetic payloads', providerAttempts > 0 && unexpectedOutbound === 0 && transportValid);
}

let failure;
try { await bounded(run(), 'Complete source-route account regression', 150_000); }
catch (error) { failure = error; }
finally {
  for (const release of releases) release(); releases.clear(); messages.length = 0;
  const cleanupDeadline = setTimeout(() => { console.error('Account Worker cleanup exceeded its deadline.'); process.exit(1); }, 10_000);
  try { for (const worker of workers) await worker.dispose(); }
  catch { failure ??= new ProbeFailure('CLEANUP_FAILED', 'Dispose isolated Worker'); }
  finally { clearTimeout(cleanupDeadline); }
}
for (const item of checks) console.log(JSON.stringify(item));
if (failure) {
  const code = failure.code ?? failure.cause?.code;
  console.error(JSON.stringify({ result: 'failed', stage: failure instanceof ProbeFailure ? failure.message : stage,
    category: typeof code === 'string' && /^[A-Z0-9_]{1,50}$/.test(code) ? code : 'RUNTIME_ERROR',
    ...(Number.isInteger(failure.status) ? { http_status: failure.status } : {}) }));
  process.exitCode = 1;
} else {
  console.log(`Account Worker source-route regression: ${checks.length}/${checks.length} passed. Isolated D1 and intercepted synthetic mail only; not Vinext, inbox, device or production acceptance.`);
}
