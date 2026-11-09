import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localAccountOptions, parseLocalAccountResponse, runLocalAccountAcceptance } from '../check-account-local.mjs';

const hostileOrigin = 'https://blocked.parishlink.invalid';
const denial = (extra = {}) => ({ status: 403, headers: new Headers({ 'content-type': 'text/plain' }), text: 'Forbidden', requestOrigin: hostileOrigin, allowFrameworkOriginDenial: true, ...extra });

test('the intentional hostile-Origin framework denial is accepted without retaining its body', () => {
  const result = parseLocalAccountResponse(denial());
  assert.equal(result.status, 403); assert.equal(result.frameworkOriginDenial, true); assert.equal(result.body, undefined);
  assert.equal(JSON.stringify(result).includes('Forbidden'), false);
});

test('non-JSON ordinary API responses remain failures even for status 403', () => {
  for (const changed of [{ allowFrameworkOriginDenial: false }, { requestOrigin: 'http://localhost:8081' }, { requestOrigin: null }, { requestOrigin: 'https://other.invalid' }]) {
    assert.throws(() => parseLocalAccountResponse(denial(changed)), /Expected JSON/);
  }
});

test('the exception cannot hide a different status, HTML, CORS grant or oversized denial', () => {
  for (const changed of [
    { status: 200 }, { status: 401 }, { status: 500 },
    { headers: new Headers({ 'content-type': 'text/html' }) },
    { headers: new Headers({ 'content-type': 'text/plain', 'access-control-allow-origin': '*' }) },
    { headers: new Headers({ 'content-type': 'text/plain', 'access-control-allow-origin': hostileOrigin }) },
    { text: 'X'.repeat(1025) }, { text: 'é'.repeat(513) },
  ]) assert.throws(() => parseLocalAccountResponse(denial(changed)), /Expected JSON/);
});

test('normal application JSON denials and empty 204 responses keep their contract', () => {
  const result = parseLocalAccountResponse(denial({ headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }), text: '{"error":"This browser origin is not allowed."}' }));
  assert.deepEqual(result.body, { error: 'This browser origin is not allowed.' }); assert.equal(result.frameworkOriginDenial, undefined);
  assert.throws(() => parseLocalAccountResponse(denial({ headers: new Headers({ 'content-type': 'application/json' }), text: '{invalid' })), /Invalid JSON/);
  assert.throws(() => parseLocalAccountResponse(denial({ headers: new Headers({ 'content-type': 'application/jsonp' }), text: '{}' })), /Expected JSON/);
  assert.equal(parseLocalAccountResponse({ status: 204, headers: new Headers(), text: '' }).body, undefined);
});

test('options reject production, remote targets, credentials and unsafe origin components', () => {
  assert.equal(localAccountOptions(['--mail-disabled-test'], {}).origin, 'http://127.0.0.1:3000');
  assert.throws(() => localAccountOptions([], {}), /mail-disabled-test/);
  assert.throws(() => localAccountOptions(['--mail-disabled-test'], { NODE_ENV: 'production' }), /production/);
  for (const origin of ['https://127.0.0.1:3000', 'http://example.com', 'http://127.0.0.1:3000/api', 'http://user:pass@127.0.0.1:3000', 'http://127.0.0.1:3000?x=1', 'http://127.0.0.1:3000/#x']) {
    assert.throws(() => localAccountOptions(['--origin', origin, '--mail-disabled-test'], {}));
  }
  assert.throws(() => localAccountOptions(['--mail-disabled-test', '--mail-disabled-test'], {}), /Duplicate/);
});

async function preflightFixture(checks) {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const calls = [];
  try {
    console.log = () => {};
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ path: new URL(url).pathname, method: options.method });
      if (calls.at(-1).path === '/health') return Response.json({ status: 'ok', service: 'parishlink-admin-api' });
      if (calls.at(-1).path === '/ready') return Response.json({ status: 'ready', service: 'parishlink-admin-api', checks });
      throw new Error('A request escaped read-only preflight.');
    };
    const result = await runLocalAccountAcceptance({ origin: 'http://127.0.0.1:3000', mailDisabledTest: true });
    return { calls, result };
  } finally { globalThis.fetch = originalFetch; console.log = originalLog; }
}

test('configured mail or push and a production-capable scanner state stop before any account write', async () => {
  const safe = { database: 'ok', privateStorage: 'configured', documentScanner: 'development-prefilter-only', accountEmail: 'disabled', pushNotifications: 'disabled' };
  for (const changed of [{ accountEmail: 'configured' }, { pushNotifications: 'configured' }, { documentScanner: 'configured' }, { database: 'failed' }]) {
    const { calls, result } = await preflightFixture({ ...safe, ...changed });
    assert.equal(result.passed, false);
    assert.deepEqual(calls.map(row => row.path), ['/health', '/ready']);
    assert.ok(calls.every(row => row.method === 'GET'));
    assert.equal(result.syntheticAccount, 'Not confirmed created.');
  }
});
