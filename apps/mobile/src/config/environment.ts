export type AppEnvironment = 'development' | 'preview' | 'production';

export type RuntimeEnvironmentInput = {
  appEnvironment?: string | undefined;
  demoMode?: string | undefined;
  apiBaseUrl?: string | undefined;
};

export type RuntimeConfiguration = {
  environment: AppEnvironment;
  demoMode: boolean;
  apiBaseUrl: string;
  isProduction: boolean;
};

const APP_ENVIRONMENTS = new Set<AppEnvironment>(['development', 'preview', 'production']);

const parseAppEnvironment = (value: string | undefined): AppEnvironment => {
  const normalized = value?.trim().toLowerCase() || 'development';
  if (!APP_ENVIRONMENTS.has(normalized as AppEnvironment)) {
    throw new Error('EXPO_PUBLIC_APP_ENV must be development, preview, or production.');
  }
  return normalized as AppEnvironment;
};

const parseDemoMode = (value: string | undefined, environment: AppEnvironment): boolean => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    if (environment !== 'development') {
      throw new Error('EXPO_PUBLIC_DEMO_MODE must be explicitly true or false outside development.');
    }
    return true;
  }
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error('EXPO_PUBLIC_DEMO_MODE must be exactly true or false.');
};

const isPrivateOrReservedHostname = (value: string): boolean => {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.test')
    || hostname.endsWith('.example')
    || hostname.endsWith('.invalid')
  ) return true;

  if (hostname === '::' || hostname === '::1') return true;
  if (hostname.includes(':') && /^(?:fc|fd|fe[89ab])/i.test(hostname)) return true;
  if (hostname.startsWith('::ffff:')) return true;

  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first = -1, second = -1] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19 || second === 51))
    || (first === 203 && second === 0)
    || first >= 224;
};

export const normalizeApiBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('EXPO_PUBLIC_API_BASE_URL is required when demo mode is disabled.');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an absolute HTTP or HTTPS URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must not contain credentials.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must not contain a query string or fragment.');
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
};

export const resolveRuntimeConfiguration = (input: RuntimeEnvironmentInput): RuntimeConfiguration => {
  const environment = parseAppEnvironment(input.appEnvironment);
  const demoMode = parseDemoMode(input.demoMode, environment);
  const apiBaseUrl = input.apiBaseUrl?.trim() ? normalizeApiBaseUrl(input.apiBaseUrl) : '';

  if (environment === 'production' && demoMode) {
    throw new Error('Production builds cannot enable ParishLink demonstration mode.');
  }
  if (!demoMode && !apiBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required when demo mode is disabled.');
  }
  if (environment !== 'development' && apiBaseUrl) {
    const parsed = new URL(apiBaseUrl);
    if (parsed.protocol !== 'https:') {
      throw new Error('Preview and production builds require an HTTPS ParishLink API URL.');
    }
    if (isPrivateOrReservedHostname(parsed.hostname)) {
      throw new Error('Preview and production builds require a public ParishLink API hostname.');
    }
  }

  return {
    environment,
    demoMode,
    apiBaseUrl,
    isProduction: environment === 'production',
  };
};

export const runtimeConfiguration = resolveRuntimeConfiguration({
  appEnvironment: process.env.EXPO_PUBLIC_APP_ENV,
  demoMode: process.env.EXPO_PUBLIC_DEMO_MODE,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
});

export const appEnvironment = runtimeConfiguration.environment;
export const demoMode = runtimeConfiguration.demoMode;
export const apiBaseUrl = runtimeConfiguration.apiBaseUrl;
