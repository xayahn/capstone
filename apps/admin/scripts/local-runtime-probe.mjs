import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

/** Read-only, bounded local testing. Never follows a redirect off the loopback.
 * @param {Record<string, string | undefined>} input
 */
export function probeOptions(input = process.env) {
  const base = new URL(input.PARISHLINK_PROBE_ORIGIN ?? 'http://127.0.0.1:3000');
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Runtime probing requires a plain local HTTP origin.');
  }
  const rounds = Number(input.PARISHLINK_PROBE_ROUNDS ?? 12);
  const intervalMs = Number(input.PARISHLINK_PROBE_INTERVAL_MS ?? 5500);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 30) throw new Error('Use 1–30 probe rounds.');
  if (!Number.isInteger(intervalMs) || intervalMs < 250 || intervalMs > 10000) throw new Error('Use a probe interval of 250–10000 ms.');
  return { origin: base.origin, rounds, intervalMs };
}

const endpoints = [
  { path: '/', status: 200, valid: text => /ParishLink/i.test(text) && !/Network connection lost|Internal Server Error|vite-error-overlay/i.test(text) },
  { path: '/health', status: 200, valid: text => JSON.parse(text).status === 'ok' },
  { path: '/api/mobile/catalog', status: 200, valid: text => Array.isArray(JSON.parse(text).parishes) },
  { path: '/api/admin/state', status: 401, valid: text => typeof JSON.parse(text).error === 'string' },
];

async function sample(origin, endpoint) {
  const started = performance.now();
  try {
    const response = await fetch(origin + endpoint.path, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const reader = response.body?.getReader();
    if (!reader) throw new Error('MissingBody');
    const decoder = new TextDecoder(); let bytes = 0, text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('BodyLimit'); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    return { path: endpoint.path, status: response.status, pass: response.status === endpoint.status && endpoint.valid(text), ms: Math.round(performance.now() - started) };
  } catch (error) {
    // Never print returned HTML, request headers, exception messages or private data.
    return { path: endpoint.path, status: 0, pass: false, failure: error?.name === 'TimeoutError' ? 'timeout' : 'transport-or-invalid-body', ms: Math.round(performance.now() - started) };
  }
}

export async function runProbe(options = probeOptions()) {
  const startedAt = new Date().toISOString(), samples = [];
  console.log(JSON.stringify({ phase: 'start', startedAt, ...options, note: 'Read-only local development probe; not a production load test.' }));
  for (let round = 0; round < options.rounds; round++) {
    samples.push(...await Promise.all(endpoints.map(endpoint => sample(options.origin, endpoint))));
    if ((round + 1) % 3 === 0 || round + 1 === options.rounds) console.log(JSON.stringify({ phase: 'progress', rounds: round + 1, requests: samples.length, failed: samples.filter(item => !item.pass).length }));
    if (round + 1 < options.rounds) await delay(options.intervalMs);
  }
  const durations = samples.map(item => item.ms).sort((a, b) => a - b);
  const result = {
    startedAt, finishedAt: new Date().toISOString(), ...options,
    requests: samples.length, passed: samples.filter(item => item.pass).length,
    failed: samples.filter(item => !item.pass), p95Ms: durations[Math.ceil(durations.length * .95) - 1],
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runProbe();
  if (result.failed.length) process.exitCode = 1;
}
