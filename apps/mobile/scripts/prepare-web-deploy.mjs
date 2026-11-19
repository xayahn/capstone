// Prepare the exported parishioner web app (web-build/) for static hosting.
// Run after: npx expo export --platform web --output-dir web-build
// with EXPO_PUBLIC_APP_ENV=preview, EXPO_PUBLIC_DEMO_MODE=false and the HTTPS
// EXPO_PUBLIC_API_BASE_URL of the ParishLink server.
// It checks the bundle targets that server (and no local address), then writes
// web-build/_headers with security headers that allow API calls to that origin only.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'web-build');
const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';

function fail(message) {
  console.error(message);
  process.exit(1);
}

let api;
try { api = new URL(apiBase); } catch { fail('Set EXPO_PUBLIC_API_BASE_URL to the HTTPS ParishLink API URL used for the export.'); }
if (api.protocol !== 'https:') fail('EXPO_PUBLIC_API_BASE_URL must use HTTPS.');
if (!existsSync(join(output, 'index.html'))) fail('web-build/index.html not found. Run the Expo web export first.');

const bundleDir = join(output, '_expo', 'static', 'js', 'web');
const bundles = readdirSync(bundleDir).filter(name => name.endsWith('.js'));
if (bundles.length === 0) fail('No web bundle found in web-build/_expo/static/js/web.');
for (const name of bundles) {
  const text = readFileSync(join(bundleDir, name), 'latin1');
  if (!text.includes(apiBase.replace(/\/+$/, ''))) fail(`${name} does not contain ${apiBase}. Export again with the same EXPO_PUBLIC_API_BASE_URL.`);
  for (const forbidden of ['localhost:3000', '127.0.0.1:3000', '192.168.']) {
    if (text.includes(forbidden)) fail(`${name} contains "${forbidden}". Export with EXPO_NO_DOTENV=1 and the HTTPS server URL.`);
  }
}

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  // react-native-web writes component styles into <style> elements at runtime.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // blob:/data: are needed because the web upload reads the picked file with fetch(fileUri).
  `connect-src 'self' blob: data: ${api.origin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000
  X-Robots-Tag: noindex, nofollow

/index.html
  Cache-Control: no-cache

/
  Cache-Control: no-cache
`;
writeFileSync(join(output, '_headers'), headers);
console.log(JSON.stringify({ ok: true, api: api.origin, bundles }));
