import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'package.json'));
const ts = require('typescript');
// Resolve through Wrangler's actual installation, including pnpm's isolated
// layout. Miniflare remains a Wrangler dependency rather than a new app package.
const wranglerRequire = createRequire(realpathSync(require.resolve('wrangler/package.json')));
const { Miniflare, Log, LogLevel } = wranglerRequire('miniflare');

function compile(relativePath) {
  const source = readFileSync(resolve(root, relativePath), 'utf8');
  const result = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const errors = result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error) ?? [];
  assert.equal(errors.length, 0, 'Provider source must transpile before the Worker probe');
  return result.outputText;
}

// All Request construction and provider helper execution happen inside
// workerd. Merely constructing these options in Node would miss Workers-only
// RequestInit incompatibilities. The injected transports return synthetic
// responses without calling fetch; a blocked outbound service is defense in depth.
const entry = `
import { generatePublicAssistantReply } from './gemini.mjs';
import { callExpo, PushProviderError } from './expo.mjs';

export default {
  async fetch() {
    const checks = [];
    const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
    const key = 'synthetic-worker-probe-key-0000000000';
    const configuration = { enabled: 'true', apiKey: key, model: 'gemini-3.5-flash' };
    const sources = [{ id: 'navigation', content: 'Choose a service and submit a request. Parish staff review requests.' }];
    const prompt = 'How does appointment booking work?';
    const geminiBody = {
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [{ text: JSON.stringify({
          text: 'Choose a service and submit an appointment request. Parish staff review the request before approval.',
          sourceIds: ['navigation'], needsHuman: false,
        }) }] },
      }],
    };
    const tickets = { data: [{ status: 'ok', id: 'synthetic-ticket' }] };
    const payload = [{ to: 'ExpoPushToken[synthetic_worker_probe]', title: 'ParishLink', body: 'An update is available.' }];
    let transportCalls = 0;
    let manualRequests = 0;
    const transport = async (url, init) => {
      transportCalls += 1;
      const request = new Request(url, init);
      if (request.redirect === 'manual') manualRequests += 1;
      return Response.json(String(url).includes('generativelanguage.googleapis.com') ? geminiBody : tickets);
    };

    const answer = await generatePublicAssistantReply(prompt, true, sources, configuration, transport);
    check('Gemini helper succeeds with actual Workers RequestInit validation', answer.provider === 'gemini');
    const sent = await callExpo('send', payload, 'synthetic-expo-access-token', transport);
    check('Expo helper succeeds with actual Workers RequestInit validation', sent.data?.[0]?.id === 'synthetic-ticket');
    check('Both provider requests use manual redirects', transportCalls === 2 && manualRequests === 2);

    // Reproduce the former option at the real runtime boundary. This baseline
    // is intentionally local; no source files or provider configuration change.
    let legacyUnsupported = false;
    try { new Request('https://provider.invalid', { redirect: 'error' }); }
    catch (error) { legacyUnsupported = error instanceof TypeError; }
    check('Installed Workers runtime rejects legacy redirect:error', legacyUnsupported);
    let legacyCalls = 0;
    const legacyTransport = async (url, init) => {
      legacyCalls += 1;
      new Request(url, { ...init, redirect: 'error' });
      return Response.json(String(url).includes('generativelanguage.googleapis.com') ? geminiBody : tickets);
    };
    const legacyAnswer = await generatePublicAssistantReply(prompt, true, sources, configuration, legacyTransport);
    check('Legacy Gemini options reproduce a controlled fallback', legacyAnswer.provider === 'parishlink' && legacyAnswer.fallbackReason === 'unavailable');
    let legacyPushFailed = false;
    try { await callExpo('send', payload, undefined, legacyTransport); }
    catch (error) { legacyPushFailed = error instanceof PushProviderError && error.code === 'ProviderUnavailable'; }
    check('Legacy Expo options reproduce a controlled provider failure', legacyPushFailed && legacyCalls === 2);

    let redirectCalls = 0;
    const redirected = async (url, init) => {
      redirectCalls += 1;
      new Request(url, init);
      return new Response(null, { status: 302, headers: { Location: 'https://redirect.invalid' } });
    };
    const rejected = await generatePublicAssistantReply(prompt, true, sources, configuration, redirected);
    check('Gemini rejects a redirect without a follow-up request', rejected.provider === 'parishlink'
      && rejected.fallbackReason === 'unavailable' && redirectCalls === 1);
    let pushRedirectFailed = false;
    try { await callExpo('send', payload, undefined, redirected); }
    catch (error) { pushRedirectFailed = error instanceof PushProviderError && !error.retryable; }
    check('Expo rejects a redirect without retry or follow-up', pushRedirectFailed && redirectCalls === 2);
    return Response.json({ runtime: 'workerd', checks });
  },
};
`;

let outboundAttempts = 0;
const worker = new Miniflare({
  compatibilityDate: '2026-07-30',
  host: '127.0.0.1',
  port: 0,
  log: new Log(LogLevel.NONE),
  modulesRoot: root,
  modules: [
    { type: 'ESModule', path: resolve(root, 'provider-probe.mjs'), contents: entry },
    { type: 'ESModule', path: resolve(root, 'gemini.mjs'), contents: compile('backend/ai/gemini-assistant.ts') },
    { type: 'ESModule', path: resolve(root, 'expo.mjs'), contents: compile('backend/notifications/expo-provider.ts') },
  ],
  outboundService: () => {
    outboundAttempts += 1;
    return new Response('External networking is disabled in this probe.', { status: 502 });
  },
});
let deadline;
try {
  const response = await Promise.race([
    worker.dispatchFetch('http://provider-probe.local'),
    new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Local Worker provider probe timed out.')), 30_000);
    }),
  ]);
  assert.equal(response.status, 200, 'Local Worker probe must return a successful result');
  const result = await response.json();
  assert.equal(result.runtime, 'workerd');
  assert.equal(result.checks.length, 8, 'All provider runtime checks must execute');
  result.checks.push({ name: 'No external provider or other outbound request attempted', pass: outboundAttempts === 0 });
  for (const item of result.checks) console.log(JSON.stringify(item));
  assert.equal(result.checks.every(item => item.pass), true, 'Actual Worker provider compatibility checks failed');
  console.log('Provider Worker compatibility: 9/9 passed. Synthetic responses only; no provider traffic or deployment.');
} finally {
  if (deadline) clearTimeout(deadline);
  await worker.dispose();
}
