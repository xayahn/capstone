import { env } from 'cloudflare:workers';
import { MobileServiceError } from '@/backend/auth/mobile-auth';
import { mobileAllowedOrigins } from '@/backend/config/runtime-config';
import { recordServerFailure } from '@/backend/observability/server-log';
import { readSmallJson, RequestBodyError } from '@/backend/http/small-json';
import { schedulePushDispatch } from '@/backend/notifications/background-dispatch';

const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, If-Match, X-Request-Id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Cache-Control': 'no-store, max-age=0',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

function requestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  if (origin === new URL(request.url).origin) return true;
  const development = process.env.NODE_ENV !== 'production';
  return mobileAllowedOrigins(env.MOBILE_ALLOWED_ORIGINS, development).has(origin);
}

function withMobileCors(response: Response, allowedOrigin: string | null): Response {
  const headers = new Headers(response.headers);
  if (allowedOrigin) headers.set('Access-Control-Allow-Origin', allowedOrigin);
  const vary = headers.get('Vary');
  headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function mobileJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: BASE_HEADERS });
}

export function mobileEmpty(status = 204): Response {
  return new Response(null, { status, headers: BASE_HEADERS });
}

export function mobileOptions(request: Request): Response {
  try {
    if (!requestOriginAllowed(request)) return mobileJson({ error: 'This browser origin is not allowed.' }, 403);
    const response = withMobileCors(mobileEmpty(204), request.headers.get('origin'));
    response.headers.set('Access-Control-Max-Age', '600');
    return response;
  } catch (error) {
    const requestId = recordServerFailure('mobile-cors-options', error);
    return mobileJson({ error: 'The mobile API origin policy is unavailable.', requestId }, 503);
  }
}

export async function readMobileJson(request: Request, maxBytes = 24_000): Promise<Record<string, unknown>> {
  try {
    return await readSmallJson(request, maxBytes);
  } catch (error) {
    if (error instanceof RequestBodyError) throw new MobileServiceError(error.message, error.status);
    throw error;
  }
}

export async function mobileRoute(request: Request, work: () => Promise<Response>): Promise<Response> {
  // Validate once. Revalidating broken configuration in the error handler used
  // to throw a second time instead of returning a controlled, fail-closed error.
  try {
    if (!requestOriginAllowed(request)) return mobileJson({ error: 'This browser origin is not allowed.' }, 403);
  } catch (error) {
    const requestId = recordServerFailure('mobile-cors', error);
    return mobileJson({ error: 'The mobile API origin policy is unavailable.', requestId }, 503);
  }
  const allowedOrigin = request.headers.get('origin');
  try {
    const response = await work();
    if (response.ok && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) schedulePushDispatch();
    return withMobileCors(response, allowedOrigin);
  } catch (error) {
    if (error instanceof MobileServiceError) return withMobileCors(mobileJson({ error: error.message }, error.status), allowedOrigin);
    const requestId = recordServerFailure('mobile-api', error);
    return withMobileCors(mobileJson({ error: 'The request could not be completed. Please try again.', requestId }, 500), allowedOrigin);
  }
}
