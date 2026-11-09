import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This checks local configuration presence and Android client-file structure. It never contacts a provider,
// prints a credential, changes an account or sends a notification.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function localValues(paths, rootPath) {
  const values = {};
  for (const path of paths) {
    const absolute = resolve(rootPath, path);
    if (!existsSync(absolute)) continue;
    for (const line of readFileSync(absolute, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const quoted = /^(["']).*\1$/.test(match[2]);
      values[match[1]] = quoted ? match[2].slice(1, -1) : match[2].replace(/\s+#.*$/, '').trim();
    }
  }
  return values;
}

const configured = text => Boolean(text) && !/^(?:your[_ -]|replace[_ -]|example|<)/i.test(text);

/**
 * Validate only the selected public Android Firebase client configuration.
 * Never return file contents, API keys, a private key or an absolute local path.
 * A service-account credential is a different file and must not be embedded.
 * @param {{ mobileRoot: string, packageName?: string, filePath?: string, forbiddenServerKey?: string }} input
 * @returns {string[]}
 */
export function androidGoogleServicesProblems({ mobileRoot, packageName, filePath, forbiddenServerKey }) {
  const problems = [];
  if (!packageName || typeof packageName !== 'string') problems.push('Android application package is missing from app.json');
  if (!configured(filePath ?? '')) return [...problems, 'ANDROID_GOOGLE_SERVICES_FILE or android.googleServicesFile is not configured'];
  let data;
  try {
    const absolute = resolve(mobileRoot, filePath);
    const stat = statSync(absolute);
    if (!stat.isFile() || stat.size > 256_000) return [...problems, 'Android Google services file is not a supported configuration file'];
    data = JSON.parse(readFileSync(absolute, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return [...problems, 'Android Google services file is missing, unreadable or invalid JSON'];
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [...problems, 'Android Google services file has an invalid structure'];
  if (data.type === 'service_account' || Object.hasOwn(data, 'private_key')) {
    return [...problems, 'Android Google services file must be the Firebase client configuration, not a private service-account credential'];
  }
  if (forbiddenServerKey && Array.isArray(data.client) && data.client.some(client =>
    Array.isArray(client?.api_key) && client.api_key.some(item => item?.current_key === forbiddenServerKey))) {
    problems.push('Android Firebase client configuration reuses the server-only Gemini key; use a separate Firebase client key');
  }
  const info = data.project_info;
  if (!info || typeof info.project_id !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(info.project_id)) {
    problems.push('Android Firebase project ID is missing or invalid');
  }
  const projectNumber = info?.project_number;
  const validProjectNumber = typeof projectNumber === 'string' && /^[1-9][0-9]{0,29}$/.test(projectNumber);
  if (!validProjectNumber) {
    problems.push('Android Firebase project number is missing or invalid');
  }
  const client = Array.isArray(data.client) ? data.client.find(item =>
    item?.client_info?.android_client_info?.package_name === packageName) : undefined;
  if (!client) problems.push('Android Firebase client does not match the application package in app.json');
  else {
    const appId = client.client_info?.mobilesdk_app_id;
    const appPrefix = '1:' + projectNumber + ':android:';
    if (!validProjectNumber || typeof appId !== 'string' || !appId.startsWith(appPrefix)
      || !/^[a-fA-F0-9]+$/.test(appId.slice(appPrefix.length))) {
      problems.push('Android Firebase app ID is missing or does not match the project number');
    }
    if (!Array.isArray(client.api_key) || !client.api_key.some(item =>
      typeof item?.current_key === 'string' && item.current_key.trim().length > 0)) {
      problems.push('Android Firebase client API configuration is missing');
    }
  }
  return problems;
}

/**
 * @param {string} rootPath
 * @param {Record<string, string | undefined>} environment
 */
export function checkIntegrations(rootPath = root, environment = process.env) {
  const backend = localValues(['apps/admin/.env', 'apps/admin/.env.local', 'apps/admin/.dev.vars'], rootPath);
  const mobile = localValues(['apps/mobile/.env', 'apps/mobile/.env.local'], rootPath);
  const value = (values, key) => String(environment[key] ?? values[key] ?? '').trim();
  const checks = [];
  function check(name, problems) {
    checks.push({ name, configured: problems.length === 0, problems });
  }
  const geminiProblems = [];
  const serverGeminiKey = value(backend, 'GEMINI_API_KEY');
  if (value(backend, 'GEMINI_ENABLED') !== 'true') geminiProblems.push('GEMINI_ENABLED is not true');
  if (!configured(serverGeminiKey)) geminiProblems.push('GEMINI_API_KEY is missing or a placeholder');
  check('Gemini server configuration', geminiProblems);

  const mailProblems = [];
  if (value(backend, 'MAIL_ENABLED') !== 'true') mailProblems.push('MAIL_ENABLED is not true');
  if (value(backend, 'MAIL_DELIVERY_VERIFIED') !== 'true') mailProblems.push('MAIL_DELIVERY_VERIFIED is not true; controlled delivery acceptance is required');
  if (!/^re_[A-Za-z0-9_-]{12,200}$/.test(value(backend, 'RESEND_API_KEY'))) mailProblems.push('RESEND_API_KEY is missing or invalid');
  const mailFrom = value(backend, 'MAIL_FROM');
  if (mailFrom.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(mailFrom)) mailProblems.push('MAIL_FROM must be a bare verified sender address');
  check('Account recovery email configuration', mailProblems);

  let app = {};
  try { app = JSON.parse(readFileSync(resolve(rootPath, 'apps/mobile/app.json'), 'utf8')).expo ?? {}; }
  catch { /* A missing/invalid static config is reported as a missing project below. */ }
  const serverProject = value(backend, 'EXPO_PROJECT_ID');
  const mobileProject = value(mobile, 'EXPO_PUBLIC_EAS_PROJECT_ID') || app.extra?.eas?.projectId || '';
  const pushProblems = [];
  if (value(backend, 'PUSH_NOTIFICATIONS_ENABLED') !== 'true') pushProblems.push('PUSH_NOTIFICATIONS_ENABLED is not true');
  if (!uuid.test(serverProject)) pushProblems.push('EXPO_PROJECT_ID is missing or invalid');
  if (!uuid.test(mobileProject)) pushProblems.push('EXPO_PUBLIC_EAS_PROJECT_ID is missing or invalid');
  if (uuid.test(serverProject) && uuid.test(mobileProject) && serverProject.toLowerCase() !== mobileProject.toLowerCase()) {
    pushProblems.push('server and mobile Expo project IDs do not match');
  }
  if (value(backend, 'PUSH_DISPATCH_SECRET').length < 32) pushProblems.push('PUSH_DISPATCH_SECRET needs at least 32 characters');
  check('Push server/mobile configuration', pushProblems);
  check('Android Firebase client configuration', androidGoogleServicesProblems({
    mobileRoot: resolve(rootPath, 'apps/mobile'),
    packageName: app.android?.package,
    filePath: value(mobile, 'ANDROID_GOOGLE_SERVICES_FILE') || app.android?.googleServicesFile || '',
    ...(configured(serverGeminiKey) ? { forbiddenServerKey: serverGeminiKey } : {}),
  }));
  return { checks, enhancedPushSecurity: configured(value(backend, 'EXPO_ACCESS_TOKEN')) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { checks, enhancedPushSecurity } = checkIntegrations();
  for (const item of checks) {
    console.log(item.name + ': ' + (item.configured ? 'present' : 'setup needed'));
    for (const problem of item.problems) console.log('  - ' + problem);
  }
  console.log('Expo enhanced push-security access token: ' + (enhancedPushSecurity ? 'present' : 'not configured'));
  console.log('Live Gemini, email inbox delivery, Expo credentials, scheduler and device delivery: not verified by this local check.');
  console.log('No secret values were printed. No provider requests or configuration changes were made.');
  if (checks.some(item => !item.configured)) process.exitCode = 1;
}
