import { env } from 'cloudflare:workers';
import { publicReleaseVersion } from '@/backend/config/runtime-config';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
} as const;

export async function GET(): Promise<Response> {
  return Response.json(
    {
      status: 'ok',
      service: 'parishlink-admin-api',
      version: publicReleaseVersion(env.RELEASE_VERSION),
    },
    { status: 200, headers: HEADERS },
  );
}
