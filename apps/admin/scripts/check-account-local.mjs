import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const HOSTILE_ORIGIN = 'https://blocked.parishlink.invalid';

/** Actual HTTP acceptance against a running, development-only backend.
 *
 * Usage: node scripts/check-account-local.mjs --mail-disabled-test
 *        [--origin http://127.0.0.1:3000]
 *
 * The flag attests that the operator started the intended isolated local server
 * with MAIL_ENABLED=false and PUSH_NOTIFICATIONS_ENABLED=false. The script also
 * verifies those states through /ready before any mutation. It will not change
 * flags, bypass throttles, insert a test-only endpoint, or use a real mailbox.
 * Synthetic account/audit records are retained. All obtained sessions are signed
 * out in finally; no passwords, tokens, codes, emails or response bodies are logged.
 */
export function localAccountOptions(argv = process.argv.slice(2), environment = process.env) {
  const options = { origin: 'http://127.0.0.1:3000', mailDisabledTest: false, help: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (seen.has(argument)) throw new Error('Duplicate acceptance option.');
    seen.add(argument);
    if (argument === '--mail-disabled-test') options.mailDisabledTest = true;
    else if (argument === '--help') options.help = true;
    else if (argument === '--origin' && argv[index + 1] && !argv[index + 1].startsWith('--')) options.origin = argv[++index];
    else throw new Error('Unknown or incomplete acceptance option.');
  }
  const parsed = new URL(options.origin);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Account acceptance requires a plain loopback HTTP origin without credentials, paths, query or fragment.');
  }
  if (environment.NODE_ENV === 'production') throw new Error('This synthetic acceptance script cannot run in production.');
  if (!options.help && !options.mailDisabledTest) throw new Error('Review the development server settings and pass --mail-disabled-test; mail and push must be disabled.');
  return { ...options, origin: parsed.origin };
}

class AcceptanceFailure extends Error {
  constructor(label) { super(label); this.name = 'AcceptanceFailure'; }
}

/** Vinext may reject an intentionally hostile Origin before the application
 * route runs. Accept only that bounded plain-text 403 with no CORS grant. All
 * ordinary responses still need the API's JSON contract; never log denial text.
 */
export function parseLocalAccountResponse({ status, headers, text, requestOrigin, allowFrameworkOriginDenial = false }) {
  const mediaType = headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (allowFrameworkOriginDenial && requestOrigin === HOSTILE_ORIGIN && status === 403
    && !headers.has('access-control-allow-origin') && mediaType === 'text/plain'
    && Buffer.byteLength(text, 'utf8') <= 1024) {
    return { status, body: undefined, headers, frameworkOriginDenial: true };
  }
  let body;
  if (text) {
    if (mediaType !== 'application/json') throw new AcceptanceFailure('Expected JSON response.');
    try { body = JSON.parse(text); } catch { throw new AcceptanceFailure('Invalid JSON response.'); }
  }
  return { status, body, headers };
}

export async function runLocalAccountAcceptance(options) {
  // Revalidate exported entry points; callers cannot bypass the CLI safeguards.
  options = localAccountOptions(['--origin', options.origin, ...(options.mailDisabledTest ? ['--mail-disabled-test'] : [])]);
  const startedAt = new Date().toISOString();
  const checks = [];
  const tokens = new Set();
  const browserOrigin = 'http://localhost:8081';
  let failure = null;
  let cleanupFailed = false;
  let fixtureCreated = false;
  let activeStage = 'development-preflight';

  function check(name, pass, status) {
    checks.push({ name, pass: Boolean(pass), ...(status === undefined ? {} : { status }) });
    if (!pass) throw new AcceptanceFailure(name);
  }
  function tokenFrom(response) {
    const token = response.body?.accessToken;
    if (typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)) { tokens.add(token); return token; }
    throw new AcceptanceFailure('Session response must contain a bounded bearer token.');
  }
  function safeError(response, status) {
    return response.status === status && typeof response.body?.error === 'string'
      && Object.keys(response.body).every(key => ['error', 'requestId'].includes(key));
  }

  async function request(route, { method = 'GET', token, body, rawBody, contentType, origin = browserOrigin, allowFrameworkOriginDenial = false } = {}) {
    activeStage = route;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let reader;
    try {
      const response = await fetch(options.origin + route, {
        method, redirect: 'manual', signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(origin === null ? {} : { Origin: origin }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': contentType ?? 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : rawBody !== undefined ? { body: rawBody } : {}),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel(); throw new AcceptanceFailure('Unexpected redirect; no redirect was followed.');
      }
      const chunks = []; let length = 0;
      reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const next = await reader.read(); if (next.done) break;
          length += next.value.byteLength;
          if (length > 256_000) { await reader.cancel(); throw new AcceptanceFailure('Response exceeded the acceptance body limit.'); }
          chunks.push(next.value);
        }
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const text = new TextDecoder().decode(bytes);
      return parseLocalAccountResponse({ status: response.status, headers: response.headers, text, requestOrigin: origin, allowFrameworkOriginDenial });
    } catch (error) {
      if (error instanceof AcceptanceFailure) throw error;
      throw new AcceptanceFailure(controller.signal.aborted ? 'HTTP request timed out.' : 'Local HTTP connection or body read failed.');
    } finally {
      clearTimeout(timeout);
      try { reader?.releaseLock(); } catch { /* No diagnostic containing response data. */ }
    }
  }

  const suffix = randomUUID().replaceAll('-', '');
  const email = `local-account-${suffix}@example.test`;
  const absentEmail = `missing-account-${suffix}@example.test`;
  const originalPassword = `LocalA1!${randomBytes(24).toString('hex')}`;
  const updatedPassword = `LocalB2!${randomBytes(24).toString('hex')}`;
  const incorrectPassword = `WrongC3!${randomBytes(24).toString('hex')}`;
  const post = (route, body, extra) => request('/api/mobile/auth/' + route, { method: 'POST', body, ...extra });
  const session = token => request('/api/mobile/auth/session', { token });

  try {
    const health = await request('/health', { origin: null });
    check('Actual local API health', health.status === 200 && health.body?.status === 'ok' && health.body?.service === 'parishlink-admin-api', health.status);
    const ready = await request('/ready', { origin: null });
    check('Development runtime, database and private storage ready', ready.status === 200 && ready.body?.status === 'ready'
      && ready.body?.service === 'parishlink-admin-api' && ready.body?.checks?.database === 'ok'
      && ready.body?.checks?.privateStorage === 'configured'
      // /ready requires a scanner in production. This fallback exists only in development.
      && ready.body?.checks?.documentScanner === 'development-prefilter-only', ready.status);
    check('Mail and push positively disabled before synthetic writes', ready.body?.checks?.accountEmail === 'disabled' && ready.body?.checks?.pushNotifications === 'disabled');

    const unauthenticated = await session();
    check('Unauthenticated session rejected', safeError(unauthenticated, 401), unauthenticated.status);
    const disallowed = await post('password-reset/request', { email }, { origin: HOSTILE_ORIGIN, allowFrameworkOriginDenial: true });
    check('Unapproved browser origin rejected before account processing', disallowed.status === 403 && (safeError(disallowed, 403) || disallowed.frameworkOriginDenial === true)
      && !disallowed.headers.has('access-control-allow-origin'), disallowed.status);
    const catalog = await request('/api/mobile/catalog');
    check('Catalog supplies a valid active home parish', catalog.status === 200 && Array.isArray(catalog.body?.parishes) && catalog.body.parishes.some(item => typeof item.id === 'string'), catalog.status);
    const parishId = catalog.body.parishes.find(item => item.id === 'san-guillermo')?.id ?? catalog.body.parishes[0].id;

    const invalidSignUp = await post('sign-up', {});
    check('Invalid sign-up input rejected', safeError(invalidSignUp, 400), invalidSignUp.status);
    const registration = { displayName: 'Synthetic Local Account Acceptance', email, mobileNumber: '+639170000001', homeParishId: parishId,
      password: originalPassword, confirmPassword: originalPassword, acceptPrivacyNotice: true };
    const signedUp = await post('sign-up', registration);
    check('Synthetic sign-up succeeds', signedUp.status === 201 && signedUp.body?.mode === 'api', signedUp.status);
    const first = tokenFrom(signedUp); fixtureCreated = true;
    check('New account remains unverified', signedUp.body?.profile?.email === email && signedUp.body.profile.emailVerified === false);
    check('Allowed browser CORS and no-store response', signedUp.headers.get('access-control-allow-origin') === browserOrigin && signedUp.headers.get('cache-control')?.includes('no-store'));
    const duplicate = await post('sign-up', registration);
    check('Duplicate sign-up rejected without overwriting credentials', safeError(duplicate, 409), duplicate.status);

    const restored = await session(first);
    check('Session restore returns authoritative unverified account', restored.status === 200 && restored.body?.profile?.email === email && restored.body.profile.emailVerified === false, restored.status);
    const wrong = await post('sign-in', { email, password: updatedPassword });
    const unknown = await post('sign-in', { email: absentEmail, password: updatedPassword });
    check('Known and unknown wrong credentials have the same safe denial', safeError(wrong, 401) && safeError(unknown, 401) && wrong.body.error === unknown.body.error);
    const signedIn = await post('sign-in', { email, password: originalPassword }, { origin: null });
    check('Native-style sign-in without Origin succeeds', signedIn.status === 200 && signedIn.body?.mode === 'api', signedIn.status);
    const second = tokenFrom(signedIn);

    const badCurrent = await post('change-password', { currentPassword: incorrectPassword, newPassword: updatedPassword, confirmPassword: updatedPassword }, { token: first });
    check('Wrong current password cannot change credentials', safeError(badCurrent, 400), badCurrent.status);
    const mismatch = await post('change-password', { currentPassword: originalPassword, newPassword: updatedPassword, confirmPassword: originalPassword }, { token: first });
    check('Mismatched password confirmation rejected', safeError(mismatch, 400), mismatch.status);
    const weak = await post('change-password', { currentPassword: originalPassword, newPassword: 'weak', confirmPassword: 'weak' }, { token: first });
    check('Weak replacement password rejected', safeError(weak, 400), weak.status);
    const changed = await post('change-password', { currentPassword: originalPassword, newPassword: updatedPassword, confirmPassword: updatedPassword }, { token: first });
    check('Valid password change confirmed without false trigger-count error', changed.status === 204 && changed.body === undefined, changed.status);
    const preserved = await session(first);
    check('Password-changing session remains valid', preserved.status === 200 && preserved.body?.profile?.email === email, preserved.status);
    const revoked = await session(second);
    check('Other session revoked after password change', safeError(revoked, 401), revoked.status); tokens.delete(second);
    const previousLogin = await post('sign-in', { email, password: originalPassword });
    check('Previous password no longer authenticates', safeError(previousLogin, 401), previousLogin.status);
    const newLogin = await post('sign-in', { email, password: updatedPassword });
    check('Changed password authenticates', newLogin.status === 200 && newLogin.body?.profile?.emailVerified === false, newLogin.status);
    const third = tokenFrom(newLogin);

    const malformed = await request('/api/mobile/auth/password-reset/request', { method: 'POST', rawBody: '{not-json' });
    check('Malformed JSON rejected safely', safeError(malformed, 400), malformed.status);
    const textBody = await request('/api/mobile/auth/password-reset/request', { method: 'POST', rawBody: '{}', contentType: 'text/plain' });
    check('Unsupported request content type rejected', safeError(textBody, 415), textBody.status);
    const oversized = await post('password-reset/request', { email, padding: 'X'.repeat(2500) });
    check('Oversized reset request rejected', safeError(oversized, 413), oversized.status);
    const invalidEmail = await post('password-reset/request', { email: 'invalid' });
    check('Invalid recovery email rejected', safeError(invalidEmail, 400), invalidEmail.status);
    const unavailableKnown = await post('password-reset/request', { email });
    const unavailableUnknown = await post('password-reset/request', { email: absentEmail });
    check('Disabled mail returns identical safe unavailability for known and unknown accounts', safeError(unavailableKnown, 503) && safeError(unavailableUnknown, 503) && unavailableKnown.body.error === unavailableUnknown.body.error);
    const verificationUnauth = await post('email-verification/request', {});
    check('Verification request requires a session', safeError(verificationUnauth, 401), verificationUnauth.status);
    const verificationUnavailable = await post('email-verification/request', {}, { token: third });
    check('Authenticated verification explains unavailable delivery', safeError(verificationUnavailable, 503), verificationUnavailable.status);
    const invalidVerification = await post('email-verification/confirm', { code: 'AAAAAAAAAAAA' }, { token: third });
    check('Undelivered verification code cannot verify email', safeError(invalidVerification, 400), invalidVerification.status);
    const invalidReset = await post('password-reset/confirm', { email, code: 'AAAAAAAAAAAA', newPassword: originalPassword, confirmPassword: originalPassword });
    check('Undelivered reset code cannot replace credentials', safeError(invalidReset, 400), invalidReset.status);
    const unchanged = await session(third);
    check('Invalid recovery attempts do not verify or revoke the valid session', unchanged.status === 200 && unchanged.body?.profile?.emailVerified === false, unchanged.status);

    for (const [name, token] of [['current', third], ['original', first]]) {
      const signedOut = await post('sign-out', undefined, { token });
      check(`${name} session signs out`, signedOut.status === 204, signedOut.status);
      const after = await session(token);
      check(`${name} session stays revoked after logout`, safeError(after, 401), after.status);
      tokens.delete(token);
    }
  } catch (error) {
    failure = { stage: activeStage, category: error instanceof AcceptanceFailure ? error.message : 'Unexpected acceptance-run failure.' };
  } finally {
    for (const token of tokens) {
      try {
        const result = await post('sign-out', undefined, { token });
        if (![204, 401].includes(result.status)) cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
    tokens.clear();
  }

  const result = {
    kind: 'LocalDevelopmentHttpAcceptance', startedAt, finishedAt: new Date().toISOString(), origin: options.origin,
    passed: failure === null && !cleanupFailed, checks, failure,
    sessionCleanup: cleanupFailed ? 'Unconfirmed; review local test sessions before further testing.' : 'All obtained sessions revoked or already invalid.',
    syntheticAccount: fixtureCreated ? 'Retained with its audit record; no data deletion attempted.' : 'Not confirmed created.',
    notRun: ['Actual inbox delivery and successful email-code reset/verification', 'Installed Android/iOS acceptance', 'Production infrastructure or load acceptance'],
    note: 'Uses actual loopback HTTP routes with email/push disabled. No provider sends, deployment or test-only server endpoint. This is not stakeholder research.',
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = localAccountOptions();
    if (options.help) console.log('Usage: node scripts/check-account-local.mjs --mail-disabled-test [--origin http://127.0.0.1:3000]\nDevelopment-only. Requires /ready to prove mail/push disabled and the development scanner fallback. Creates a fictional account, retains its audit, revokes obtained sessions. Never logs secrets; never sends mail/push.');
    else if (!(await runLocalAccountAcceptance(options)).passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof TypeError ? 'Invalid local acceptance configuration.' : error.message);
    process.exitCode = 2;
  }
}
