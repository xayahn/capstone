import { env } from 'cloudflare:workers';
import { dispatchPushNotifications } from '@/backend/notifications/push-service';
import { recordServerFailure } from '@/backend/observability/server-log';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

/** Separate scheduler secret. Browser identity and user bearer tokens grant no access. */
export async function POST(request: Request): Promise<Response> {
  const secret = env.PUSH_DISPATCH_SECRET;
  if (!secret || secret.length < 32 || /[\s\u0000-\u001f]/.test(secret)) return Response.json({ error: 'Notification dispatch is not configured.' }, { status: 503, headers });
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.length > 1024) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers });
  const [actual, expected] = await Promise.all([digest(authorization), digest(`Bearer ${secret}`)]);
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= actual[i] ^ expected[i];
  if (different) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers });
  // Nothing from the request selects recipients, tokens, message text or URLs.
  try { return Response.json(await dispatchPushNotifications(), { headers }); }
  catch (error) {
    const requestId = recordServerFailure('push-dispatch', error);
    return Response.json({ error: 'Notification dispatch could not complete.', requestId }, { status: 503, headers });
  }
}
