const LOCAL_MOBILE_WEB_ORIGINS = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
] as const;

const RELEASE_LABEL = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

function normalizeOrigin(value: string, allowLocalHttp: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('MOBILE_ALLOWED_ORIGINS contains an invalid origin.');
  }

  const localHttp = allowLocalHttp
    && parsed.protocol === 'http:'
    && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (parsed.protocol !== 'https:' && !localHttp) {
    throw new Error('MOBILE_ALLOWED_ORIGINS must contain HTTPS origins.');
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('MOBILE_ALLOWED_ORIGINS must contain origins without credentials, paths, queries, or fragments.');
  }
  return parsed.origin;
}

export function mobileAllowedOrigins(raw: string | undefined, development: boolean): ReadonlySet<string> {
  const origins = new Set<string>(development ? LOCAL_MOBILE_WEB_ORIGINS : []);
  for (const entry of raw?.split(',') ?? []) {
    const value = entry.trim();
    if (!value) continue;
    if (value === '*') throw new Error('MOBILE_ALLOWED_ORIGINS cannot use a wildcard.');
    origins.add(normalizeOrigin(value, development));
  }
  return origins;
}

export function publicReleaseVersion(value: string | undefined): string {
  const candidate = value?.trim() ?? '';
  return RELEASE_LABEL.test(candidate) ? candidate : 'unversioned';
}
