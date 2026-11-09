import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read-only provider verification. Lists model metadata, never sends a user
// question, changes billing, prints the credential or exposes an error body.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const values = {};
try {
  for (const line of readFileSync(resolve(root, 'apps/admin/.dev.vars'), 'utf8').split(/\r?\n/)) {
    const entry = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (entry) values[entry[1]] = entry[2].replace(/^(["'])(.*)\1$/, '$2');
  }
} catch {
  console.log(JSON.stringify({ ready: false, reason: 'local-configuration-missing' }));
  process.exit(1);
}
const apiKey = process.env.GEMINI_API_KEY ?? values.GEMINI_API_KEY ?? '';
const model = process.env.GEMINI_MODEL ?? values.GEMINI_MODEL ?? 'gemini-3.5-flash';
if (!/^[A-Za-z0-9._-]{20,2048}$/.test(apiKey)) {
  console.log(JSON.stringify({ ready: false, reason: 'server-key-missing-or-invalid-shape' }));
  process.exit(1);
}

try {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
    headers: { 'x-goog-api-key': apiKey }, redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.body) throw new Error('Missing response body');
  const reader = response.body.getReader();
  let body = '', bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 512_000) { await reader.cancel(); throw new Error('Response too large'); }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } finally { reader.releaseLock(); }
  const result = JSON.parse(body);
  if (!response.ok) {
    const status = typeof result.error?.status === 'string' && /^[A-Z_]{1,60}$/.test(result.error.status)
      ? result.error.status : 'PROVIDER_REJECTED';
    console.log(JSON.stringify({ ready: false, httpStatus: response.status, providerStatus: status }));
    process.exitCode = 1;
  } else {
    const textModels = Array.isArray(result.models) ? result.models
      .filter(item => typeof item.name === 'string' && /^models\/gemini-[a-z0-9_.-]+$/i.test(item.name)
        && Array.isArray(item.supportedGenerationMethods) && item.supportedGenerationMethods.includes('generateContent'))
      .map(item => item.name.slice(7)) : [];
    const available = textModels.includes(model);
    console.log(JSON.stringify({ ready: available, generationVerified: false, httpStatus: response.status,
      configuredModelAvailable: available, textModels, additionalModelPage: Boolean(result.nextPageToken) }, null, 2));
    if (!available) process.exitCode = 1;
  }
} catch {
  console.log(JSON.stringify({ ready: false, reason: 'network-timeout-or-invalid-provider-response' }));
  process.exitCode = 2;
}
