import type { ConfigContext, ExpoConfig } from 'expo/config';

type ReleaseEnvironment = 'development' | 'preview' | 'production';

const releaseEnvironment = (): { environment: ReleaseEnvironment; demoMode: boolean } => {
  const environmentValue = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase() || 'development';
  if (!['development', 'preview', 'production'].includes(environmentValue)) {
    throw new Error('EXPO_PUBLIC_APP_ENV must be development, preview, or production.');
  }
  const environment = environmentValue as ReleaseEnvironment;
  const demoValue = process.env.EXPO_PUBLIC_DEMO_MODE?.trim().toLowerCase();
  if (!demoValue && environment !== 'development') {
    throw new Error('EXPO_PUBLIC_DEMO_MODE must be explicitly true or false outside development.');
  }
  if (demoValue && demoValue !== 'true' && demoValue !== 'false') {
    throw new Error('EXPO_PUBLIC_DEMO_MODE must be exactly true or false.');
  }
  const demoMode = demoValue ? demoValue === 'true' : true;
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';
  if (environment === 'production' && demoMode) {
    throw new Error('Production builds cannot enable ParishLink demonstration mode.');
  }
  if (!demoMode && !apiBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required when demo mode is disabled.');
  }
  if (apiBaseUrl) {
    let parsed: URL;
    try {
      parsed = new URL(apiBaseUrl);
    } catch {
      throw new Error('EXPO_PUBLIC_API_BASE_URL must be an absolute HTTP or HTTPS URL.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('EXPO_PUBLIC_API_BASE_URL is not a safe API origin.');
    }
    if (environment !== 'development') {
      const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      const octets = hostname.split('.').map(Number);
      const isPrivateIpv4 = octets.length === 4 && octets.every((part) => Number.isInteger(part)) && (
        octets[0] === 0
        || octets[0] === 10
        || octets[0] === 127
        || (octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127)
        || (octets[0] === 169 && octets[1] === 254)
        || (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31)
        || (octets[0] === 192 && octets[1] === 0)
        || (octets[0] === 192 && octets[1] === 168)
        || (octets[0] === 198 && [18, 19, 51].includes(octets[1] ?? -1))
        || (octets[0] === 203 && octets[1] === 0)
        || (octets[0] ?? 0) >= 224
      );
      const isReserved = hostname === 'localhost'
        || hostname === '::'
        || hostname === '::1'
        || hostname.startsWith('::ffff:')
        || (hostname.includes(':') && /^(?:fc|fd|fe[89ab])/i.test(hostname))
        || ['.localhost', '.local', '.test', '.example', '.invalid'].some((suffix) => hostname.endsWith(suffix));
      if (parsed.protocol !== 'https:' || isPrivateIpv4 || isReserved) {
        throw new Error('Preview and production builds require a public HTTPS ParishLink API URL.');
      }
    }
  }
  return { environment, demoMode };
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const runtimeConfiguration = releaseEnvironment();
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim()
    || (typeof config.extra?.eas?.projectId === 'string' ? config.extra.eas.projectId : undefined);
  if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('EXPO_PUBLIC_EAS_PROJECT_ID must be the UUID of your Expo project.');
  }
  const googleServicesFile = process.env.ANDROID_GOOGLE_SERVICES_FILE?.trim();
  if (
    process.env.PARISHLINK_REQUIRE_PRODUCTION === 'true'
    && runtimeConfiguration.environment !== 'production'
  ) {
    throw new Error('Release verification requires EXPO_PUBLIC_APP_ENV=production.');
  }

  return {
    ...config,
    name: config.name ?? 'ParishLink',
    slug: config.slug ?? 'parishlink-mobile',
    ...(googleServicesFile ? { android: { ...config.android, googleServicesFile } } : {}),
    extra: {
      ...config.extra,
      appRole: 'parishioner',
      releaseEnvironment: runtimeConfiguration.environment,
      demoMode: runtimeConfiguration.demoMode,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
    },
  };
};
