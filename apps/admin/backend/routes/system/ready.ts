import { env } from 'cloudflare:workers';
import { ensurePublicRuntimeDatabase } from '@/db/runtime';
import { mobileAllowedOrigins, publicReleaseVersion } from '@/backend/config/runtime-config';
import { recordServerFailure } from '@/backend/observability/server-log';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
} as const;

export async function GET(): Promise<Response> {
  try {
    if (!env.DB || !env.FILES) throw new Error('Required storage binding unavailable.');
    await ensurePublicRuntimeDatabase();
    const database = await env.DB.prepare('SELECT 1 AS ready').first<{ ready: number }>();
    if (database?.ready !== 1) throw new Error('Database readiness query failed.');

    const browserOrigins = mobileAllowedOrigins(
      env.MOBILE_ALLOWED_ORIGINS,
      process.env.NODE_ENV !== 'production',
    );
    return Response.json(
      {
        status: 'ready',
        service: 'parishlink-admin-api',
        version: publicReleaseVersion(env.RELEASE_VERSION),
        checks: {
          database: 'ok',
          privateStorage: 'configured',
          mobileBrowserAccess: browserOrigins.size > 0 ? 'configured' : 'native-only',
        },
      },
      { status: 200, headers: HEADERS },
    );
  } catch (error) {
    const requestId = recordServerFailure('readiness', error);
    return Response.json(
      {
        status: 'not_ready',
        service: 'parishlink-admin-api',
        version: publicReleaseVersion(env.RELEASE_VERSION),
        requestId,
      },
      { status: 503, headers: HEADERS },
    );
  }
}
