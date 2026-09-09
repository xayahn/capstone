import { env } from 'cloudflare:workers';
import { MobileServiceError } from '@/backend/auth/mobile-auth';
import { mobileAllowedOrigins } from '@/backend/config/runtime-config';
import { recordServerFailure } from '@/backend/observability/server-log';

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

function withMobileCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('origin');
  if (origin && requestOriginAllowed(request)) headers.set('Access-Control-Allow-Origin', origin);
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
    const response = withMobileCors(mobileEmpty(204), request);
    response.headers.set('Access-Control-Max-Age', '600');
    return response;
  } catch (error) {
    const requestId = recordServerFailure('mobile-cors-options', error);
    return mobileJson({ error: 'The mobile API origin policy is unavailable.', requestId }, 503);
  }
}

export async function readMobileJson(request: Request, maxBytes = 24_000): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new MobileServiceError('Send this request as JSON.', 415);
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) throw new MobileServiceError('The request is too large.', 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new MobileServiceError('The request is too large.', 413);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new MobileServiceError('The request body is not valid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MobileServiceError('The request body is invalid.');
  return value as Record<string, unknown>;
}

export async function mobileRoute(request: Request, work: () => Promise<Response>): Promise<Response> {
  try {
    if (!requestOriginAllowed(request)) return mobileJson({ error: 'This browser origin is not allowed.' }, 403);
    return withMobileCors(await work(), request);
  } catch (error) {
    if (error instanceof MobileServiceError) return withMobileCors(mobileJson({ error: error.message }, error.status), request);
    const requestId = recordServerFailure('mobile-api', error);
    return withMobileCors(mobileJson({ error: 'The request could not be completed. Please try again.', requestId }, 500), request);
  }
}
